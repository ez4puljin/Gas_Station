import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BankMatchType, Prisma } from '@prisma/client';
import {
  type BankStatementQuery,
  type ImportBankStatementInput,
  toMnt,
  type UpdateBankTxnInput,
} from '@fuel/schemas';
import { AuditAction, type AuthUser, JournalSource, PaymentMethod, STD_ACCOUNT } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { ProcurementService } from '../procurement/procurement.service';

const txnInclude = {
  customer: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.BankTransactionInclude;

/**
 * Банкны хуулга — импорт → тааруулах → Ерөнхий дэвтэрт бүртгэх.
 *
 * Файлыг ХӨТӨЧ дээр задалдаг (apps/web, exceljs) тул энд зөвхөн задлагдсан
 * JSON ирнэ — сервер талд файлын формат мэдэх шаардлагагүй.
 *
 * Бүртгэх дүрэм (мөнгө = integer MNT, §2.1):
 *   CUSTOMER_PAYMENT (орлого) → customers.recordPayment  → Дт банк / Кт авлага
 *   SUPPLIER_PAYMENT (зарлага) → procurement.recordPayment → Дт өглөг / Кт банк
 *   GL_ENTRY  орлого  → Дт банк / Кт <данс>
 *   GL_ENTRY  зарлага → Дт <данс> / Кт банк
 *   IGNORED   → бичилт үүсгэхгүй (дотоод шилжүүлэг г.м)
 */
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
    private readonly customers: CustomersService,
    private readonly procurement: ProcurementService,
  ) {}

  // ── Импорт ──
  async importStatement(user: AuthUser, input: ImportBankStatementInput, ip: string | null) {
    await this.accounting.ensureChartOfAccounts(user.companyId);

    const statement = await this.prisma.$transaction(async (tx) => {
      const st = await tx.bankStatement.create({
        data: {
          companyId: user.companyId,
          accountNumber: input.accountNumber,
          currency: input.currency,
          filename: input.filename,
          dateFrom: input.dateFrom ? new Date(`${input.dateFrom}T00:00:00Z`) : null,
          dateTo: input.dateTo ? new Date(`${input.dateTo}T00:00:00Z`) : null,
          glAccountCode: input.glAccountCode,
          uploadedById: user.sub,
          transactions: {
            create: input.transactions.map((t, i) => ({
              txnDate: new Date(`${t.txnDate}T00:00:00Z`),
              debitMnt: BigInt(t.debitMnt),
              creditMnt: BigInt(t.creditMnt),
              bankDescription: t.bankDescription,
              bankCounterpart: t.bankCounterpart,
              isFee: t.isFee,
              isSettlement: t.isSettlement,
              // Шимтгэлийг урьдчилан таамаглаж дансны бичилт болгоно (хэрэглэгч засаж болно)
              ...(t.isFee
                ? { matchType: BankMatchType.GL_ENTRY, accountCode: STD_ACCOUNT.OTHER_EXPENSE, description: 'Банкны шимтгэл' }
                : {}),
              sortOrder: i,
            })),
          },
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.BANK_IMPORT, entity: 'BankStatement', entityId: st.id, after: { accountNumber: st.accountNumber, count: input.transactions.length }, ip },
        tx,
      );
      return st;
    });
    return this.get(user, statement.id);
  }

  // ── Жагсаалт / дэлгэрэнгүй ──
  async list(user: AuthUser, q: BankStatementQuery) {
    const where: Prisma.BankStatementWhereInput = { companyId: user.companyId };
    if (q.accountNumber) where.accountNumber = q.accountNumber;
    if (q.from || q.to) {
      where.dateFrom = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}),
        ...(q.to ? { lte: new Date(`${q.to}T00:00:00Z`) } : {}),
      };
    }
    const rows = await this.prisma.bankStatement.findMany({
      where,
      orderBy: [{ dateFrom: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { _count: { select: { transactions: true } } },
    });
    // Бүртгэгдсэн мөрийн тоог нэг багц query-гээр (N+1-гүй)
    const ids = rows.map((r) => r.id);
    const posted = ids.length
      ? await this.prisma.bankTransaction.groupBy({
          by: ['statementId'],
          where: { statementId: { in: ids }, postedAt: { not: null } },
          _count: { _all: true },
        })
      : [];
    const postedBy = new Map(posted.map((p) => [p.statementId, p._count._all]));
    return rows.map((r) => ({
      id: r.id,
      accountNumber: r.accountNumber,
      currency: r.currency,
      dateFrom: r.dateFrom,
      dateTo: r.dateTo,
      filename: r.filename,
      glAccountCode: r.glAccountCode,
      createdAt: r.createdAt,
      txnCount: r._count.transactions,
      postedCount: postedBy.get(r.id) ?? 0,
    }));
  }

  async get(user: AuthUser, id: string) {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id, companyId: user.companyId },
      include: { transactions: { include: txnInclude, orderBy: { sortOrder: 'asc' } } },
    });
    if (!st) throw new NotFoundException({ code: 'STATEMENT_NOT_FOUND', message: 'Хуулга олдсонгүй' });

    const totals = st.transactions.reduce(
      (a, t) => ({
        debitMnt: a.debitMnt + t.debitMnt,
        creditMnt: a.creditMnt + t.creditMnt,
        postedCount: a.postedCount + (t.postedAt ? 1 : 0),
        matchedCount: a.matchedCount + (t.matchType ? 1 : 0),
      }),
      { debitMnt: 0n, creditMnt: 0n, postedCount: 0, matchedCount: 0 },
    );
    return { ...st, totals };
  }

  // ── Мөр тааруулах ──
  async updateTxn(user: AuthUser, txnId: string, input: UpdateBankTxnInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.findFirst({
        where: { id: txnId, statement: { companyId: user.companyId } },
      });
      if (!txn) throw new NotFoundException({ code: 'TXN_NOT_FOUND', message: 'Гүйлгээ олдсонгүй' });
      if (txn.postedAt) {
        throw new ConflictException({ code: 'ALREADY_POSTED', message: 'Бүртгэгдсэн гүйлгээг засах боломжгүй. Эхлээд буцаана уу' });
      }
      const updated = await tx.bankTransaction.update({
        where: { id: txnId },
        data: {
          matchType: (input.matchType ?? null) as BankMatchType | null,
          description: input.description ?? txn.description,
          customerId: input.matchType === 'CUSTOMER_PAYMENT' ? (input.customerId ?? null) : null,
          supplierId: input.matchType === 'SUPPLIER_PAYMENT' ? (input.supplierId ?? null) : null,
          accountCode: input.matchType === 'GL_ENTRY' ? (input.accountCode ?? null) : null,
        },
        include: txnInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.BANK_MATCH, entity: 'BankTransaction', entityId: txnId, before: txn, after: updated, ip },
        tx,
      );
      return updated;
    });
  }

  // ── Бүртгэх (бүх тааруулсан мөрийг) ──
  async postStatement(user: AuthUser, statementId: string, ip: string | null) {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, companyId: user.companyId },
      include: { transactions: { where: { postedAt: null, matchType: { not: null } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!st) throw new NotFoundException({ code: 'STATEMENT_NOT_FOUND', message: 'Хуулга олдсонгүй' });
    if (st.transactions.length === 0) {
      throw new BadRequestException({ code: 'NOTHING_TO_POST', message: 'Бүртгэх мөр алга — эхлээд гүйлгээг тааруулна уу' });
    }
    await this.accounting.ensureChartOfAccounts(user.companyId);

    let posted = 0;
    let skipped = 0;
    for (const t of st.transactions) {
      if (t.matchType === BankMatchType.IGNORED) {
        await this.prisma.bankTransaction.update({ where: { id: t.id }, data: { postedAt: new Date(), postedById: user.sub } });
        skipped += 1;
        continue;
      }
      await this.postOne(user, st.glAccountCode, t, ip);
      posted += 1;
    }

    await this.audit.record({
      actorId: user.sub,
      action: AuditAction.BANK_POST,
      entity: 'BankStatement',
      entityId: st.id,
      after: { posted, skipped },
      ip,
    });
    return { posted, skipped, total: st.transactions.length };
  }

  /** Нэг мөрийг төрлөөс нь хамааруулан бүртгэнэ (тус бүр өөрийн transaction-д). */
  private async postOne(
    user: AuthUser,
    bankAccountCode: string,
    t: { id: string; matchType: BankMatchType | null; debitMnt: bigint; creditMnt: bigint; customerId: string | null; supplierId: string | null; accountCode: string | null; description: string; bankDescription: string; txnDate: Date },
    ip: string | null,
  ) {
    const isIncome = t.creditMnt > 0n;
    const amount = isIncome ? t.creditMnt : t.debitMnt;
    if (amount <= 0n) {
      throw new BadRequestException({ code: 'ZERO_AMOUNT', message: 'Дүн 0 байх гүйлгээг бүртгэх боломжгүй' });
    }
    const memo = t.description || t.bankDescription || 'Банкны хуулга';

    // Харилцагч/нийлүүлэгчийн төлбөр — одоо байгаа үйлчилгээг ашиглана
    // (тэдгээр нь дэд дэвтэр + GL-ийг зэрэг зөв бичдэг).
    if (t.matchType === BankMatchType.CUSTOMER_PAYMENT && t.customerId) {
      await this.customers.recordPayment(user, t.customerId, { amount: toMnt(amount), method: PaymentMethod.TRANSFER, note: memo }, ip);
      await this.prisma.bankTransaction.update({ where: { id: t.id }, data: { postedAt: new Date(), postedById: user.sub } });
      return;
    }
    if (t.matchType === BankMatchType.SUPPLIER_PAYMENT && t.supplierId) {
      await this.procurement.recordPayment(user, t.supplierId, { amount: toMnt(amount), method: PaymentMethod.TRANSFER, note: memo }, ip);
      await this.prisma.bankTransaction.update({ where: { id: t.id }, data: { postedAt: new Date(), postedById: user.sub } });
      return;
    }
    if (t.matchType === BankMatchType.GL_ENTRY && t.accountCode) {
      await this.prisma.$transaction(async (tx) => {
        const entry = await this.accounting.postJournalInTx(tx, {
          companyId: user.companyId,
          date: t.txnDate,
          source: JournalSource.BANK,
          memo,
          refType: 'bank_txn',
          refId: t.id,
          createdById: user.sub,
          lines: isIncome
            ? [
                { accountCode: bankAccountCode, debitMnt: amount },
                { accountCode: t.accountCode!, creditMnt: amount },
              ]
            : [
                { accountCode: t.accountCode!, debitMnt: amount },
                { accountCode: bankAccountCode, creditMnt: amount },
              ],
        });
        await tx.bankTransaction.update({
          where: { id: t.id },
          data: { journalEntryId: entry.id, postedAt: new Date(), postedById: user.sub },
        });
      });
      return;
    }
    throw new BadRequestException({ code: 'BAD_MATCH', message: 'Гүйлгээний тааруулалт дутуу байна' });
  }

  // ── Хуулга устгах (зөвхөн бүртгэгдээгүй бол) ──
  async remove(user: AuthUser, id: string, ip: string | null) {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id, companyId: user.companyId },
      include: { _count: { select: { transactions: { where: { postedAt: { not: null } } } } } },
    });
    if (!st) throw new NotFoundException({ code: 'STATEMENT_NOT_FOUND', message: 'Хуулга олдсонгүй' });
    if (st._count.transactions > 0) {
      throw new ConflictException({ code: 'HAS_POSTED', message: 'Бүртгэгдсэн гүйлгээтэй хуулгыг устгах боломжгүй' });
    }
    await this.prisma.bankStatement.delete({ where: { id } });
    await this.audit.record({ actorId: user.sub, action: AuditAction.BANK_IMPORT, entity: 'BankStatement', entityId: id, before: st, after: { deleted: true }, ip });
    return { deleted: true };
  }
}
