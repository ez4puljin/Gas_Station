import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AccountQuery,
  CreateAccountInput,
  CreateJournalEntryInput,
  UpdateAccountInput,
} from '@fuel/schemas';
import {
  AccountType,
  AuditAction,
  type AuthUser,
  JournalSource,
  NORMAL_SIDE_OF,
} from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_CHART_OF_ACCOUNTS } from './chart-of-accounts';

/** Журналд бичих нэг мөр (дотоод — service хооронд). */
export interface PostLine {
  accountCode: string;
  debitMnt?: bigint;
  creditMnt?: bigint;
  stationId?: string | null;
  memo?: string | null;
}
export interface PostJournalParams {
  companyId: string;
  stationId?: string | null;
  date: Date;
  source: JournalSource;
  memo?: string | null;
  refType?: string | null;
  refId?: string | null;
  createdById: string;
  lines: PostLine[];
}

/**
 * Нягтлан бодох бүртгэл — Ерөнхий дэвтэр (GL). Давхар бичилт: журнал бүрийн
 * нийт дебет = нийт кредит (postJournalInTx хатуу шалгана). Мөнгө = BigInt MNT (§2.1).
 * postJournalInTx нь бусад модулийн transaction дотроос дуудагдаж авто-бичилт хийнэ.
 */
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Дансны төлөвлөгөө ──
  /** Компанид данс байхгүй бол өгөгдмөл дансны төлөвлөгөөг үүсгэнэ (idempotent). */
  async ensureChartOfAccounts(companyId: string): Promise<{ created: number }> {
    const existing = await this.prisma.account.count({ where: { companyId } });
    if (existing > 0) return { created: 0 };
    await this.prisma.$transaction(async (tx) => {
      // Эцэг дансыг эхэлж (parent шаардлагатай тул дарааллаар).
      const byCode = new Map<string, string>();
      for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
        const created = await tx.account.create({
          data: {
            companyId,
            code: a.code,
            name: a.name,
            type: a.type,
            normalSide: NORMAL_SIDE_OF[a.type],
            isPostable: a.isPostable ?? true,
            parentId: a.parentCode ? (byCode.get(a.parentCode) ?? null) : null,
          },
        });
        byCode.set(a.code, created.id);
      }
    });
    return { created: DEFAULT_CHART_OF_ACCOUNTS.length };
  }

  /**
   * Дансны жагсаалт — дэлгэц дээрх хайлтын мөрөөр шүүнэ.
   * Шүүлт таарсан данс бүрийн ЭЦЭГ дансуудыг мөн буцаана — эс бөгөөс мод тасарч,
   * хүүхэд данс эзэнгүй харагдана.
   */
  async listAccounts(user: AuthUser, q?: AccountQuery) {
    const all = await this.prisma.account.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { code: 'asc' },
      include: { station: { select: { id: true, code: true, name: true } } },
    });
    if (!q) return all;

    const needle = (q.q ?? '').trim().toLowerCase();
    const matches = all.filter((a) => {
      if (!q.includeInactive && !a.isActive) return false;
      if (q.type && a.type !== q.type) return false;
      if (q.stationId && a.stationId !== q.stationId) return false;
      if (!needle) return true;
      const code = a.code.toLowerCase();
      const name = a.name.toLowerCase();
      if (q.mode === 'equals') return code === needle || name === needle;
      if (q.mode === 'startsWith') return code.startsWith(needle) || name.startsWith(needle);
      return code.includes(needle) || name.includes(needle);
    });

    // Эцэг дансуудыг нөхөж мод бүтэн байлгана
    const byId = new Map(all.map((a) => [a.id, a]));
    const keep = new Set<string>();
    for (const m of matches) {
      keep.add(m.id);
      let p = m.parentId ? byId.get(m.parentId) : undefined;
      while (p && !keep.has(p.id)) {
        keep.add(p.id);
        p = p.parentId ? byId.get(p.parentId) : undefined;
      }
    }
    return all.filter((a) => keep.has(a.id));
  }

  /**
   * Данс устгах — soft-delete (§2.6). Бичилттэй эсвэл хүүхэд данстай бол ХОРИГЛОНО:
   * түүхэн журнал эзэнгүй үлдэх, мод тасрахаас сэргийлнэ.
   */
  async deleteAccount(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const acc = await tx.account.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!acc) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: 'Данс олдсонгүй' });

      const lines = await tx.journalLine.count({ where: { accountId: id } });
      if (lines > 0) {
        throw new BadRequestException({
          code: 'ACCOUNT_HAS_ENTRIES',
          message: `Энэ дансанд ${lines} бичилт байна. Устгах боломжгүй — идэвхгүй болгоно уу`,
        });
      }
      const kids = await tx.account.count({ where: { parentId: id, deletedAt: null } });
      if (kids > 0) {
        throw new BadRequestException({
          code: 'ACCOUNT_HAS_CHILDREN',
          message: `Энэ дансанд ${kids} дэд данс байна. Эхлээд тэдгээрийг устгана уу`,
        });
      }
      const deleted = await tx.account.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.ACCOUNT_CHANGE, entity: 'Account', entityId: id, before: acc, after: { deleted: true }, ip },
        tx,
      );
      return { deleted: true, id: deleted.id };
    });
  }

  async createAccount(user: AuthUser, input: CreateAccountInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.account.findFirst({ where: { companyId: user.companyId, code: input.code } });
      if (dup) throw new BadRequestException({ code: 'ACCOUNT_CODE_DUP', message: 'Дансны код давхцаж байна' });
      let parentId: string | null = null;
      if (input.parentCode) {
        const parent = await tx.account.findFirst({ where: { companyId: user.companyId, code: input.parentCode } });
        if (!parent) throw new NotFoundException({ code: 'PARENT_NOT_FOUND', message: 'Эцэг данс олдсонгүй' });
        parentId = parent.id;
      }
      const account = await tx.account.create({
        data: {
          companyId: user.companyId,
          code: input.code,
          name: input.name,
          type: input.type,
          normalSide: NORMAL_SIDE_OF[input.type],
          isPostable: input.isPostable,
          parentId,
          description: input.description ?? null,
          currency: input.currency,
          journalName: input.journalName ?? null,
          stationId: input.stationId ?? null,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.ACCOUNT_CHANGE, entity: 'Account', entityId: account.id, after: account, ip },
        tx,
      );
      return account;
    });
  }

  async updateAccount(user: AuthUser, id: string, input: UpdateAccountInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.account.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: 'Данс олдсонгүй' });
      const account = await tx.account.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          isActive: input.isActive ?? undefined,
          isPostable: input.isPostable ?? undefined,
          currency: input.currency ?? undefined,
          journalName: input.journalName === undefined ? undefined : (input.journalName ?? null),
          stationId: input.stationId === undefined ? undefined : (input.stationId ?? null),
          description: input.description === undefined ? undefined : input.description,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.ACCOUNT_CHANGE, entity: 'Account', entityId: id, before, after: account, ip },
        tx,
      );
      return account;
    });
  }

  // ── Журналын бичилт (core primitive) ──
  /** UB (Asia/Ulaanbaatar) календарийн он/сар/өдөр — баримтын дугаарт. */
  private ubYmd(now: Date): string {
    const ub = new Date(now.getTime() + 8 * 3600 * 1000);
    return `${ub.getUTCFullYear()}/${String(ub.getUTCMonth() + 1).padStart(2, '0')}/${String(ub.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * Журналд бичих ЦӨМ үйлдэл — ЗААВАЛ transaction дотроос дуудна (атомик).
   * Тэнцэл (Σдебет=Σкредит>0), данс байгаа+postable+компанид харьяалагдахыг шалгана.
   * Бусад модул (POS/худалдан авалт/касс/цалин) энэ функцээр авто-бичилт хийнэ.
   */
  async postJournalInTx(tx: Prisma.TransactionClient, params: PostJournalParams) {
    if (params.lines.length < 2) {
      throw new BadRequestException({ code: 'JOURNAL_MIN_LINES', message: 'Журналд дор хаяж 2 мөр' });
    }
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const l of params.lines) {
      const d = l.debitMnt ?? 0n;
      const c = l.creditMnt ?? 0n;
      if (d < 0n || c < 0n) throw new BadRequestException({ code: 'JOURNAL_NEG', message: 'Дебет/кредит сөрөг байж болохгүй' });
      if ((d > 0n) === (c > 0n)) {
        throw new BadRequestException({ code: 'JOURNAL_LINE_SIDE', message: 'Мөр бүр дебет ЭСВЭЛ кредитийн нэг талтай' });
      }
      totalDebit += d;
      totalCredit += c;
    }
    if (totalDebit !== totalCredit || totalDebit === 0n) {
      throw new BadRequestException({ code: 'JOURNAL_UNBALANCED', message: 'Нийт дебет = нийт кредит байх ёстой' });
    }

    // Данс шийдэх (код → id), postable + компани шалгах.
    const codes = [...new Set(params.lines.map((l) => l.accountCode))];
    const accounts = await tx.account.findMany({
      where: { companyId: params.companyId, code: { in: codes }, deletedAt: null },
      select: { id: true, code: true, isPostable: true, isActive: true },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    for (const code of codes) {
      const a = byCode.get(code);
      if (!a) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND', message: `Данс олдсонгүй: ${code}` });
      if (!a.isPostable) throw new BadRequestException({ code: 'ACCOUNT_NOT_POSTABLE', message: `Бүлэг дансанд бичиж болохгүй: ${code}` });
    }

    // Баримтын дугаар: JE-YYYY/MM/DD-0001 (компани дотор, бизнесийн ОГНООгоор — бичсэн өдрөөр биш,
    // ингэснээр буцаан огноолсон бичилт давхцахгүй).
    // Дугаарыг ТООЛЖ биш, тухайн өдрийн ХАМГИЙН ИХ дугаараас нэмнэ: устгал/цоорхой гарсан ч
    // (эсвэл зэрэгцээ бичилтэд) давхцахгүй. Дараалал 4 оронтой тул текст эрэмбэ = тоон эрэмбэ.
    const prefix = `JE-${this.ubYmd(params.date)}-`;
    const last = await tx.journalEntry.findFirst({
      where: { companyId: params.companyId, entryNo: { startsWith: prefix } },
      orderBy: { entryNo: 'desc' },
      select: { entryNo: true },
    });
    const seq = last ? (Number.parseInt(last.entryNo.slice(prefix.length), 10) || 0) : 0;
    const entryNo = `${prefix}${String(seq + 1).padStart(4, '0')}`;

    const entry = await tx.journalEntry.create({
      data: {
        companyId: params.companyId,
        stationId: params.stationId ?? null,
        entryNo,
        date: params.date,
        source: params.source,
        memo: params.memo ?? null,
        refType: params.refType ?? null,
        refId: params.refId ?? null,
        createdById: params.createdById,
        lines: {
          create: params.lines.map((l) => ({
            accountId: byCode.get(l.accountCode)!.id,
            debitMnt: l.debitMnt ?? 0n,
            creditMnt: l.creditMnt ?? 0n,
            stationId: l.stationId ?? params.stationId ?? null,
            memo: l.memo ?? null,
          })),
        },
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });
    return entry;
  }

  /** Гар журналын бичилт — UI-аас (тэнцэл schema-д шалгасан; энд дахин шалгана). */
  async createManualEntry(user: AuthUser, input: CreateJournalEntryInput, ip: string | null) {
    const date = new Date(`${input.date}T00:00:00+08:00`);
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.postJournalInTx(tx, {
        companyId: user.companyId,
        stationId: input.stationId ?? null,
        date,
        source: input.source ?? JournalSource.MANUAL,
        memo: input.memo ?? null,
        createdById: user.sub,
        lines: input.lines.map((l) => ({
          accountCode: l.accountCode,
          debitMnt: l.debitMnt ?? 0n,
          creditMnt: l.creditMnt ?? 0n,
          stationId: l.stationId ?? null,
          memo: l.memo ?? null,
        })),
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.JOURNAL_POST, entity: 'JournalEntry', entityId: entry.id, after: entry, stationId: input.stationId ?? null, ip },
        tx,
      );
      return entry;
    });
  }

  /** Журнал буцаах — эсрэг (дебет↔кредит) шинэ бичилт үүсгэж reversedId холбоно. */
  async reverseEntry(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const orig = await tx.journalEntry.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
        include: { lines: { include: { account: { select: { code: true } } } } },
      });
      if (!orig) throw new NotFoundException({ code: 'ENTRY_NOT_FOUND', message: 'Журнал олдсонгүй' });
      if (orig.reversedId) throw new BadRequestException({ code: 'ALREADY_REVERSED', message: 'Аль хэдийн буцаагдсан' });
      const rev = await this.postJournalInTx(tx, {
        companyId: user.companyId,
        stationId: orig.stationId,
        date: new Date(),
        source: JournalSource.ADJUSTMENT,
        memo: `Буцаалт: ${orig.entryNo}`,
        refType: 'reversal',
        refId: orig.id,
        createdById: user.sub,
        lines: orig.lines.map((l) => ({
          accountCode: l.account.code,
          debitMnt: l.creditMnt, // эсрэг тал
          creditMnt: l.debitMnt,
          stationId: l.stationId,
        })),
      });
      await tx.journalEntry.update({ where: { id: orig.id }, data: { reversedId: rev.id } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.JOURNAL_REVERSE, entity: 'JournalEntry', entityId: orig.id, after: { reversalId: rev.id }, ip },
        tx,
      );
      return rev;
    });
  }

  private ubRange(from: string, to: string) {
    const start = new Date(`${from}T00:00:00+08:00`);
    const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    return { start, end };
  }

  /**
   * Журналын жагсаалт. ГҮЙЦЭТГЭЛ: мөрүүдийг (JournalLine) ЭНД татахгүй — жагсаалтад
   * зөвхөн нийт дүн л хэрэгтэй. Мөрийг задлахад `getEntry(id)`-ээр авна.
   * (1000 бичилтийн бүх мөрийг данстай нь татах нь ~830KB payload үүсгэдэг байсан.)
   */
  async listEntries(user: AuthUser, from: string, to: string, stationId?: string, source?: string) {
    const { start, end } = this.ubRange(from, to);
    const rows = await this.prisma.journalEntry.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        date: { gte: start, lt: end },
        ...(stationId ? { stationId } : {}),
        ...(source ? { source: source as JournalSource } : {}),
      },
      select: {
        id: true, entryNo: true, date: true, source: true, memo: true,
        stationId: true, reversedId: true, refType: true, refId: true,
      },
      orderBy: { date: 'desc' },
      take: 1000,
    });
    if (rows.length === 0) return [];

    // Нийт дүн + мөрийн тоог НЭГ багц query-гээр (бичилт бүрд тусад нь хандахгүй).
    const sums = await this.prisma.journalLine.groupBy({
      by: ['entryId'],
      where: { entryId: { in: rows.map((r) => r.id) } },
      _sum: { debitMnt: true },
      _count: { _all: true },
    });
    const byEntry = new Map(sums.map((x) => [x.entryId, x]));
    return rows.map((r) => ({
      ...r,
      amountMnt: byEntry.get(r.id)?._sum.debitMnt ?? 0n,
      lineCount: byEntry.get(r.id)?._count._all ?? 0,
    }));
  }

  async getEntry(user: AuthUser, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { lines: { include: { account: { select: { code: true, name: true } } } }, station: { select: { code: true, name: true } } },
    });
    if (!entry) throw new NotFoundException({ code: 'ENTRY_NOT_FOUND', message: 'Журнал олдсонгүй' });
    return entry;
  }

  /** Per-account дебет/кредит нийлбэр (мужид) — групп. */
  private async sumByAccount(companyId: string, dateFilter: Prisma.DateTimeFilter, stationId?: string) {
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        entry: { companyId, posted: true, deletedAt: null, date: dateFilter, ...(stationId ? { stationId } : {}) },
      },
      _sum: { debitMnt: true, creditMnt: true },
    });
    return grouped;
  }

  /** Гүйлгээний баланс — данс бүрийн дебет/кредит нийлбэр + үлдэгдэл. */
  async trialBalance(user: AuthUser, from: string, to: string, stationId?: string) {
    const { start, end } = this.ubRange(from, to);
    const grouped = await this.sumByAccount(user.companyId, { gte: start, lt: end }, stationId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, code: true, name: true, type: true, normalSide: true },
    });
    const sumById = new Map(grouped.map((g) => [g.accountId, g._sum]));
    let totalDebit = 0n;
    let totalCredit = 0n;
    const rows = accounts
      .map((a) => {
        const s = sumById.get(a.id);
        const debit = s?.debitMnt ?? 0n;
        const credit = s?.creditMnt ?? 0n;
        return { code: a.code, name: a.name, type: a.type, debitMnt: debit, creditMnt: credit };
      })
      .filter((r) => r.debitMnt !== 0n || r.creditMnt !== 0n)
      .sort((a, b) => a.code.localeCompare(b.code));
    for (const r of rows) {
      totalDebit += r.debitMnt;
      totalCredit += r.creditMnt;
    }
    return { from, to, rows, totalDebitMnt: totalDebit, totalCreditMnt: totalCredit, balanced: totalDebit === totalCredit };
  }

  /** Орлогын тайлан (P&L) — орлого − зардал = цэвэр ашиг. */
  async profitAndLoss(user: AuthUser, from: string, to: string, stationId?: string) {
    const { start, end } = this.ubRange(from, to);
    const grouped = await this.sumByAccount(user.companyId, { gte: start, lt: end }, stationId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, deletedAt: null, type: { in: [AccountType.REVENUE, AccountType.EXPENSE] } },
      select: { id: true, code: true, name: true, type: true },
    });
    const sumById = new Map(grouped.map((g) => [g.accountId, g._sum]));
    const revenue: { code: string; name: string; amountMnt: bigint }[] = [];
    const expense: { code: string; name: string; amountMnt: bigint }[] = [];
    let totalRevenue = 0n;
    let totalExpense = 0n;
    for (const a of accounts.sort((x, y) => x.code.localeCompare(y.code))) {
      const s = sumById.get(a.id);
      const debit = s?.debitMnt ?? 0n;
      const credit = s?.creditMnt ?? 0n;
      if (a.type === AccountType.REVENUE) {
        const amt = credit - debit; // орлого = кредит талын
        if (amt !== 0n) revenue.push({ code: a.code, name: a.name, amountMnt: amt });
        totalRevenue += amt;
      } else {
        const amt = debit - credit; // зардал = дебет талын
        if (amt !== 0n) expense.push({ code: a.code, name: a.name, amountMnt: amt });
        totalExpense += amt;
      }
    }
    return {
      from,
      to,
      revenue,
      expense,
      totalRevenueMnt: totalRevenue,
      totalExpenseMnt: totalExpense,
      netIncomeMnt: totalRevenue - totalExpense,
    };
  }

  /** Баланс — тайлант огнооны хөрөнгө = өр + өмч (+ хуримтлагдаагүй ашиг). */
  async balanceSheet(user: AuthUser, asOf: string, stationId?: string) {
    const end = new Date(new Date(`${asOf}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    const grouped = await this.sumByAccount(user.companyId, { lt: end }, stationId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, code: true, name: true, type: true },
    });
    const sumById = new Map(grouped.map((g) => [g.accountId, g._sum]));
    const section = (type: AccountType, creditNormal: boolean) => {
      const items: { code: string; name: string; amountMnt: bigint }[] = [];
      let total = 0n;
      for (const a of accounts.filter((x) => x.type === type).sort((x, y) => x.code.localeCompare(y.code))) {
        const s = sumById.get(a.id);
        const debit = s?.debitMnt ?? 0n;
        const credit = s?.creditMnt ?? 0n;
        const amt = creditNormal ? credit - debit : debit - credit;
        if (amt !== 0n) items.push({ code: a.code, name: a.name, amountMnt: amt });
        total += amt;
      }
      return { items, total };
    };
    const assets = section(AccountType.ASSET, false);
    const liabilities = section(AccountType.LIABILITY, true);
    const equity = section(AccountType.EQUITY, true);
    const revenue = section(AccountType.REVENUE, true);
    const expense = section(AccountType.EXPENSE, false);
    const netIncomeMnt = revenue.total - expense.total; // хаагдаагүй ашиг → өмчид нэмэгдэнэ

    const totalEquityMnt = equity.total + netIncomeMnt;
    const totalLiabEquityMnt = liabilities.total + totalEquityMnt;
    return {
      asOf,
      assets: assets.items,
      totalAssetsMnt: assets.total,
      liabilities: liabilities.items,
      totalLiabilitiesMnt: liabilities.total,
      equity: equity.items,
      netIncomeMnt,
      totalEquityMnt,
      totalLiabEquityMnt,
      balanced: assets.total === totalLiabEquityMnt,
    };
  }
}
