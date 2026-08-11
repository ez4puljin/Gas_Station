import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import {
  type CashAdjustInput,
  type CashTransferInput,
  divRoundHalfUp,
  milliToDecimalString,
  type OptionalStationRange,
  type SalesReportQuery,
  splitVatFromGross,
  toMilliUnits,
} from '@fuel/schemas';
import { AuditAction, type AuthUser, CashMovementType, JournalSource, PaymentMethod as PM, STD_ACCOUNT } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';

/** Сэжигтэй буцаалтын босго (₮) — аномали илрүүлэлт §7.4 */
const LARGE_REFUND_THRESHOLD = 100_000n;

/** Asia/Ulaanbaatar (UTC+8) бизнесийн өдрийн UTC хязгаар */
function ubDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

function ubToday(): string {
  const ub = new Date(Date.now() + 8 * 3600 * 1000);
  return ub.toISOString().slice(0, 10);
}

/** CSV нүд — null→'', таслал/хашилт/мөр escape, formula injection (=,+,-,@) сэргийлэх. */
function csvCell(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Хандах эрхтэй салбарууд — ҮРГЭЛЖ DB-гээс баталгаажуулна (§10).
   * Token-ийн stationIds-д хязгаарлахаас гадна company + deletedAt-ийг DB-д шалгана
   * (хуучирсан/устгагдсан/өөр компанийн салбар орохоос сэргийлнэ).
   */
  private async accessibleStationIds(user: AuthUser): Promise<string[]> {
    const stations = await this.prisma.station.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(user.allStations ? {} : { id: { in: user.stationIds } }),
      },
      select: { id: true },
    });
    return stations.map((s) => s.id);
  }

  // ── Салбарын өдрийн тайлан ──────────────────────────────
  async dailyReport(user: AuthUser, stationId: string, date: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const { start, end } = ubDayRange(date);
    const summary = await this.stationDaySummary(stationId, start, end);
    return { stationId, date, ...summary };
  }

  // ── Өдрийн хаалт (EOD) — GL-д нэгтгэн бичих ──────────────
  private bizDate(date: string): Date {
    return new Date(`${date}T00:00:00Z`); // @db.Date — өдрийн хэсэг л хадгалагдана
  }

  /**
   * Тухайн өдрийн борлуулсан барааны өртөг (COGS). Түлш = грейдийн жигнэсэн дундаж
   * нийлүүлэлтийн өртгөөр; бараа = product.costMnt-аар. Мөнгө = integer MNT (§2.1).
   */
  private async dayCogs(stationId: string, start: Date, end: Date): Promise<{ fuelCogsMnt: bigint; productCogsMnt: bigint }> {
    const saleWhere = { stationId, deletedAt: null, soldAt: { gte: start, lt: end }, status: { not: SaleStatus.VOIDED } };
    const [fuelSold, productSold] = await Promise.all([
      this.prisma.saleLine.groupBy({ by: ['fuelGradeId'], where: { type: 'FUEL', sale: saleWhere }, _sum: { quantity: true } }),
      this.prisma.saleLine.groupBy({ by: ['productId'], where: { type: 'PRODUCT', sale: saleWhere }, _sum: { quantity: true } }),
    ]);

    // Түлш: грейдийн жигнэсэн дундаж литрийн өртөг (бүх RECEIVED нийлүүлэлтээс).
    const gradeIds = fuelSold.map((f) => f.fuelGradeId).filter((x): x is string => !!x);
    const delAgg = gradeIds.length
      ? await this.prisma.fuelDelivery.groupBy({
          by: ['fuelGradeId'],
          where: { stationId, status: 'RECEIVED', deletedAt: null, fuelGradeId: { in: gradeIds } },
          _sum: { liters: true, totalCostMnt: true },
        })
      : [];
    const avgByGrade = new Map<string, { milli: bigint; cost: bigint }>();
    for (const d of delAgg) {
      avgByGrade.set(d.fuelGradeId, { milli: toMilliUnits(d._sum.liters?.toString() ?? '0'), cost: d._sum.totalCostMnt ?? 0n });
    }
    let fuelCogsMnt = 0n;
    for (const f of fuelSold) {
      if (!f.fuelGradeId) continue;
      const soldMilli = toMilliUnits(f._sum.quantity?.toString() ?? '0');
      const avg = avgByGrade.get(f.fuelGradeId);
      if (avg && avg.milli > 0n) fuelCogsMnt += divRoundHalfUp(soldMilli * avg.cost, avg.milli);
    }

    // Бараа: product.costMnt × тоо хэмжээ.
    const productIds = productSold.map((p) => p.productId).filter((x): x is string => !!x);
    const products = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costMnt: true } })
      : [];
    const costById = new Map(products.map((p) => [p.id, p.costMnt ?? 0n]));
    let productCogsMnt = 0n;
    for (const p of productSold) {
      if (!p.productId) continue;
      const soldMilli = toMilliUnits(p._sum.quantity?.toString() ?? '0');
      productCogsMnt += divRoundHalfUp(soldMilli * (costById.get(p.productId) ?? 0n), 1000n);
    }
    return { fuelCogsMnt, productCogsMnt };
  }

  /** EOD статус + урьдчилсан дүн (хаалтаас өмнө харах). */
  async eodStatus(user: AuthUser, stationId: string, date: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const { start, end } = ubDayRange(date);
    const [summary, cogs, close] = await Promise.all([
      this.stationDaySummary(stationId, start, end),
      this.dayCogs(stationId, start, end),
      this.prisma.dailyClose.findUnique({ where: { stationId_businessDate: { stationId, businessDate: this.bizDate(date) } } }),
    ]);
    const cogsTotalMnt = cogs.fuelCogsMnt + cogs.productCogsMnt;
    return {
      stationId,
      date,
      closed: !!close,
      close,
      summary,
      cogs: { ...cogs, totalMnt: cogsTotalMnt },
      grossProfitMnt: summary.netMnt - cogsTotalMnt, // НӨАТ-гүй цэвэр орлого − өртөг
    };
  }

  /**
   * Салбарын нэг өдрийн борлуулалтыг GL-д нэгтгэн бичиж "хаах". Нэг өдөрт нэг удаа.
   * Журнал: Дт касс/банк/авлага (төлбөрийн хэлбэрээр) = Кт орлого (түлш/бараа цэвэр) + НӨАТ.
   * Буцаалт байвал эсрэг мөрөөр цэвэрлэнэ. Тэнцэл хатуу (postJournalInTx).
   * v1: өртөг (COGS)/нөөц хасалт хараахан бичигдэхгүй — дараагийн алхам.
   */
  async closeDay(user: AuthUser, stationId: string, date: string, ip: string | null) {
    await assertStationAccess(this.prisma, user, stationId);
    const existing = await this.prisma.dailyClose.findUnique({
      where: { stationId_businessDate: { stationId, businessDate: this.bizDate(date) } },
    });
    if (existing) throw new BadRequestException({ code: 'DAY_ALREADY_CLOSED', message: 'Энэ өдөр аль хэдийн хаагдсан' });

    const { start, end } = ubDayRange(date);
    const [s, cogs] = await Promise.all([
      this.stationDaySummary(stationId, start, end),
      this.dayCogs(stationId, start, end),
    ]);
    await this.accounting.ensureChartOfAccounts(user.companyId);

    return this.prisma.$transaction(async (tx) => {
      let journalEntryId: string | null = null;
      if (s.grossMnt > 0n) {
        // Орлогыг түлш/бараагаар цэвэр (ex-VAT) задлана — нийт цэвэр=netMnt, НӨАТ=vatMnt тогтмол.
        const productNet = splitVatFromGross(s.productSalesMnt).net;
        const fuelNet = s.netMnt - productNet; // үлдэгдлээр (нийт цэвэр яг таарна)
        const cash = s.byMethod[PM.CASH] ?? 0n;
        const bank = (s.byMethod[PM.CARD] ?? 0n) + (s.byMethod[PM.TRANSFER] ?? 0n) + (s.byMethod[PM.MOBILE] ?? 0n) + (s.byMethod[PM.FUEL_CARD] ?? 0n);
        const ar = s.byMethod[PM.CREDIT] ?? 0n;

        const lines: { accountCode: string; debitMnt?: bigint; creditMnt?: bigint; memo?: string }[] = [];
        if (cash > 0n) lines.push({ accountCode: STD_ACCOUNT.CASH, debitMnt: cash, memo: 'Бэлэн' });
        if (bank > 0n) lines.push({ accountCode: STD_ACCOUNT.BANK, debitMnt: bank, memo: 'Карт/шилжүүлэг' });
        if (ar > 0n) lines.push({ accountCode: STD_ACCOUNT.AR_TRADE, debitMnt: ar, memo: 'Зээл' });
        if (fuelNet > 0n) lines.push({ accountCode: STD_ACCOUNT.REV_FUEL, creditMnt: fuelNet });
        if (productNet > 0n) lines.push({ accountCode: STD_ACCOUNT.REV_GOODS, creditMnt: productNet });
        if (s.vatMnt > 0n) lines.push({ accountCode: STD_ACCOUNT.VAT_PAYABLE, creditMnt: s.vatMnt });
        if (s.refundsMnt > 0n) {
          const { net: rNet, vat: rVat } = splitVatFromGross(s.refundsMnt);
          if (rNet > 0n) lines.push({ accountCode: STD_ACCOUNT.REV_FUEL, debitMnt: rNet, memo: 'Буцаалт' });
          if (rVat > 0n) lines.push({ accountCode: STD_ACCOUNT.VAT_PAYABLE, debitMnt: rVat, memo: 'Буцаалт НӨАТ' });
          lines.push({ accountCode: STD_ACCOUNT.CASH, creditMnt: s.refundsMnt, memo: 'Буцаалт' });
        }

        // Борлуулсан барааны өртөг (COGS): Дт өртөг = Кт нөөц (өөрөө тэнцэнэ).
        if (cogs.fuelCogsMnt > 0n) {
          lines.push({ accountCode: STD_ACCOUNT.COGS_FUEL, debitMnt: cogs.fuelCogsMnt, memo: 'Түлшний өртөг' });
          lines.push({ accountCode: STD_ACCOUNT.INVENTORY_FUEL, creditMnt: cogs.fuelCogsMnt });
        }
        if (cogs.productCogsMnt > 0n) {
          lines.push({ accountCode: STD_ACCOUNT.COGS_GOODS, debitMnt: cogs.productCogsMnt, memo: 'Барааны өртөг' });
          lines.push({ accountCode: STD_ACCOUNT.INVENTORY_GOODS, creditMnt: cogs.productCogsMnt });
        }

        const entry = await this.accounting.postJournalInTx(tx, {
          companyId: user.companyId,
          stationId,
          date: start,
          source: JournalSource.EOD,
          memo: `Өдрийн хаалт ${date}`,
          refType: 'eod',
          createdById: user.sub,
          lines,
        });
        journalEntryId = entry.id;
      }

      const close = await tx.dailyClose.create({
        data: {
          stationId,
          businessDate: this.bizDate(date),
          salesGrossMnt: s.grossMnt,
          salesNetMnt: s.netMnt,
          vatMnt: s.vatMnt,
          journalEntryId,
          closedById: user.sub,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: 'EOD_CLOSE', entity: 'DailyClose', entityId: close.id, after: close, stationId, ip },
        tx,
      );
      return { ...close, journalEntryId };
    });
  }

  /** Хаалтыг дахин нээх — GL журналыг буцааж (reversal) + хаалтын бичлэг устгана (дахин хаах боломжтой). */
  async reopenDay(user: AuthUser, id: string, ip: string | null) {
    const close = await this.prisma.dailyClose.findFirst({ where: { id, station: { companyId: user.companyId } } });
    if (!close) throw new NotFoundException({ code: 'CLOSE_NOT_FOUND', message: 'Хаалт олдсонгүй' });
    await assertStationAccess(this.prisma, user, close.stationId);
    return this.prisma.$transaction(async (tx) => {
      if (close.journalEntryId) {
        const orig = await tx.journalEntry.findUnique({
          where: { id: close.journalEntryId },
          include: { lines: { include: { account: { select: { code: true } } } } },
        });
        if (orig && !orig.reversedId) {
          const rev = await this.accounting.postJournalInTx(tx, {
            companyId: user.companyId,
            stationId: close.stationId,
            date: new Date(),
            source: JournalSource.ADJUSTMENT,
            memo: `EOD дахин нээх: ${orig.entryNo}`,
            refType: 'reversal',
            refId: orig.id,
            createdById: user.sub,
            lines: orig.lines.map((l) => ({ accountCode: l.account.code, debitMnt: l.creditMnt, creditMnt: l.debitMnt })),
          });
          await tx.journalEntry.update({ where: { id: orig.id }, data: { reversedId: rev.id } });
        }
      }
      await tx.dailyClose.delete({ where: { id: close.id } });
      await this.audit.record(
        { actorId: user.sub, action: 'EOD_REOPEN', entity: 'DailyClose', entityId: close.id, before: close, stationId: close.stationId, ip },
        tx,
      );
      return { reopened: true };
    });
  }

  /** Хаалтын жагсаалт (салбар/огноогоор). */
  async listCloses(user: AuthUser, stationId?: string) {
    let stationIds: string[];
    if (stationId) {
      await assertStationAccess(this.prisma, user, stationId);
      stationIds = [stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    return this.prisma.dailyClose.findMany({
      where: { stationId: { in: stationIds } },
      include: { station: { select: { code: true, name: true } } },
      orderBy: { businessDate: 'desc' },
      take: 90,
    });
  }

  // ── Бэлэн мөнгөний менежмент (касс → сейф → банк) ──────
  /** Сейф дэх бэлэн мөнгөний үлдэгдэл = Σ DROP − Σ DEPOSIT + Σ ADJUSTMENT(тэмдэгтэй). */
  async safeBalance(user: AuthUser, stationId: string): Promise<bigint> {
    await assertStationAccess(this.prisma, user, stationId);
    const rows = await this.prisma.cashMovement.groupBy({
      by: ['type'],
      where: { stationId },
      _sum: { amountMnt: true },
    });
    let bal = 0n;
    for (const r of rows) {
      const a = r._sum.amountMnt ?? 0n;
      if (r.type === CashMovementType.DROP) bal += a;
      else if (r.type === CashMovementType.DEPOSIT) bal -= a;
      else bal += a; // ADJUSTMENT тэмдэгтэй
    }
    return bal;
  }

  /** Касс→сейф (DROP) эсвэл сейф→банк (DEPOSIT) шилжүүлэг — GL-д бичнэ. */
  async recordCashTransfer(user: AuthUser, input: CashTransferInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    await this.accounting.ensureChartOfAccounts(user.companyId);
    // DEPOSIT үед сейфэд хүрэлцэхүйц мөнгө байх ёстой.
    if (input.type === 'DEPOSIT') {
      const bal = await this.safeBalance(user, input.stationId);
      if (input.amount > bal) {
        throw new BadRequestException({ code: 'INSUFFICIENT_SAFE', message: 'Сейфэд хүрэлцэхүйц мөнгө алга' });
      }
    }
    const [dr, cr, memo] =
      input.type === 'DROP'
        ? [STD_ACCOUNT.SAFE, STD_ACCOUNT.CASH, 'Касс → сейф']
        : [STD_ACCOUNT.BANK, STD_ACCOUNT.SAFE, 'Сейф → банк'];

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.accounting.postJournalInTx(tx, {
        companyId: user.companyId,
        stationId: input.stationId,
        date: new Date(),
        source: JournalSource.CASH,
        memo: input.note ? `${memo}: ${input.note}` : memo,
        refType: 'cash',
        createdById: user.sub,
        lines: [
          { accountCode: dr, debitMnt: input.amount },
          { accountCode: cr, creditMnt: input.amount },
        ],
      });
      const mv = await tx.cashMovement.create({
        data: {
          stationId: input.stationId,
          type: input.type as CashMovementType,
          amountMnt: input.amount,
          reference: input.reference ?? null,
          note: input.note ?? null,
          shiftId: input.shiftId ?? null,
          journalEntryId: entry.id,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: 'CASH_MOVE', entity: 'CashMovement', entityId: mv.id, after: mv, stationId: input.stationId, ip },
        tx,
      );
      return mv;
    });
  }

  /** Сейфийн тооллогын засвар — тэмдэгтэй (+ илүү → орлого, − дутуу → хорогдол), reason заавал. */
  async recordCashAdjust(user: AuthUser, input: CashAdjustInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    if (input.amountMnt === 0n) throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Дүн 0 байж болохгүй' });
    await this.accounting.ensureChartOfAccounts(user.companyId);
    const abs = input.amountMnt > 0n ? input.amountMnt : -input.amountMnt;
    // + : сейф нэмэгдэв (илүүдэл орлого) → Дт сейф, Кт бусад орлого
    // − : сейф хорогдов (дутагдал) → Дт хорогдол, Кт сейф
    const lines =
      input.amountMnt > 0n
        ? [{ accountCode: STD_ACCOUNT.SAFE, debitMnt: abs }, { accountCode: STD_ACCOUNT.REV_OTHER, creditMnt: abs }]
        : [{ accountCode: STD_ACCOUNT.SHRINKAGE, debitMnt: abs }, { accountCode: STD_ACCOUNT.SAFE, creditMnt: abs }];

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.accounting.postJournalInTx(tx, {
        companyId: user.companyId,
        stationId: input.stationId,
        date: new Date(),
        source: JournalSource.CASH,
        memo: `Сейф тооллого: ${input.reason}`,
        refType: 'cash',
        createdById: user.sub,
        lines,
      });
      const mv = await tx.cashMovement.create({
        data: {
          stationId: input.stationId,
          type: CashMovementType.ADJUSTMENT,
          amountMnt: input.amountMnt, // тэмдэгтэй
          note: input.reason,
          journalEntryId: entry.id,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: 'CASH_ADJUST', entity: 'CashMovement', entityId: mv.id, after: mv, stationId: input.stationId, ip },
        tx,
      );
      return mv;
    });
  }

  /** Бэлэн мөнгөний хөдөлгөөний жагсаалт + сейфийн үлдэгдэл. */
  async cashMovements(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const [items, balance] = await Promise.all([
      this.prisma.cashMovement.findMany({ where: { stationId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.safeBalance(user, stationId),
    ]);
    return { stationId, safeBalanceMnt: balance, items };
  }

  /** Дотоод: нэг салбарын нэг өдрийн нэгтгэл (daily + consolidated-д дахин ашиглана) */
  private async stationDaySummary(stationId: string, start: Date, end: Date) {
    const saleWhere = {
      stationId,
      deletedAt: null,
      soldAt: { gte: start, lt: end },
      status: { not: SaleStatus.VOIDED },
    };

    const [salesAgg, byMethodRows, fuelRows, productAgg, refundAgg, voidCount, grades] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: saleWhere,
          _sum: { totalMnt: true, vatMnt: true, subtotalMnt: true },
          _count: true,
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { sale: saleWhere },
          _sum: { amountMnt: true },
        }),
        this.prisma.saleLine.groupBy({
          by: ['fuelGradeId'],
          where: { type: 'FUEL', sale: saleWhere },
          _sum: { quantity: true, lineTotalMnt: true },
        }),
        this.prisma.saleLine.aggregate({
          where: { type: 'PRODUCT', sale: saleWhere },
          _sum: { lineTotalMnt: true },
        }),
        // Буцаалтыг ЭХ борлуулалтын soldAt өдрөөр + хүчинтэй борлуулалтаар scope —
        // netAfterRefunds тухайн өдрийн борлуулалттай тэнцэнэ; VOIDED/устгагдсан биш (§7.4).
        this.prisma.refund.aggregate({
          where: {
            sale: {
              stationId,
              soldAt: { gte: start, lt: end },
              deletedAt: null,
              status: { not: SaleStatus.VOIDED },
            },
          },
          _sum: { amountMnt: true },
          _count: true,
        }),
        this.prisma.sale.count({
          where: { stationId, deletedAt: null, soldAt: { gte: start, lt: end }, status: SaleStatus.VOIDED },
        }),
        this.prisma.fuelGrade.findMany({ select: { id: true, code: true } }),
      ]);

    const gradeCode = new Map(grades.map((g) => [g.id, g.code]));

    const byMethod: Record<string, bigint> = {
      [PM.CASH]: 0n,
      [PM.CARD]: 0n,
      [PM.FUEL_CARD]: 0n,
      [PM.MOBILE]: 0n,
      [PM.TRANSFER]: 0n,
      [PM.CREDIT]: 0n, // зээл (авлагад) — байхгүй бол breakdown нь gross-т нийлэхгүй болно
    };
    for (const row of byMethodRows) {
      byMethod[row.method] = row._sum.amountMnt ?? 0n;
    }
    // Бодит цуглуулсан (бэлэн/карт/мобайл) vs зээлд бичсэн (авлага) — тайланг буруу
    // уншихаас сэргийлж тусад нь гаргана.
    const creditMnt = byMethod[PM.CREDIT] ?? 0n;

    let fuelLitersMilli = 0n;
    const fuelByGrade = fuelRows.map((r) => {
      const qty = r._sum.quantity?.toString() ?? '0';
      fuelLitersMilli += toMilliUnits(qty);
      return {
        grade: r.fuelGradeId ? (gradeCode.get(r.fuelGradeId) ?? null) : null,
        liters: qty,
        amountMnt: r._sum.lineTotalMnt ?? 0n,
      };
    });

    // Тэмдэглэл: grossMnt/vatMnt/fuelByGrade нь БОРЛУУЛАЛТЫН (accrual) дүн — буцаалтаар
    // хэсэгчлэн засагдаагүй. Буцаалтыг refundsMnt/netAfterRefundsMnt-аар ТУСАД нь харуулна.
    // Грейд/НӨАТ-ыг буцаалтаар нарийн цэвэрлэхэд RefundLine (мөр) хэрэгтэй — дараагийн фаз.
    const grossMnt = salesAgg._sum.totalMnt ?? 0n;
    const vatMnt = salesAgg._sum.vatMnt ?? 0n;
    const netMnt = salesAgg._sum.subtotalMnt ?? 0n;
    const refundsMnt = refundAgg._sum.amountMnt ?? 0n;

    return {
      salesCount: salesAgg._count,
      grossMnt,
      vatMnt,
      netMnt,
      byMethod,
      creditMnt, // зээлд бичсэн (авлага) — кассад ороогүй
      collectedMnt: grossMnt - creditMnt, // бодит цуглуулсан (бэлэн/карт/мобайл)
      fuelByGrade,
      fuelLiters: milliToDecimalString(fuelLitersMilli),
      productSalesMnt: productAgg._sum.lineTotalMnt ?? 0n,
      refundsMnt,
      refundsCount: refundAgg._count,
      voidCount,
      netAfterRefundsMnt: grossMnt - refundsMnt,
    };
  }

  /**
   * ОЛОН салбарын нэг өдрийн нийлбэр үзүүлэлт — салбар бүрд query давтахгүйгээр НЭГ багц
   * (3 query, салбарын тооноос хамаарахгүй). Нэгдсэн тайлан/KPI-д төлбөрийн хэлбэр, грейд,
   * барааны задаргаа хэрэггүй тул `stationDaySummary`-г салбар тутам дуудахаа больсон
   * (өмнө нь 7 query × N салбар).
   */
  private async stationDayTotals(stationIds: string[], start: Date, end: Date) {
    type Totals = { salesCount: number; grossMnt: bigint; vatMnt: bigint; refundsMnt: bigint; fuelLitersMilli: bigint };
    const out = new Map<string, Totals>(
      stationIds.map((id) => [id, { salesCount: 0, grossMnt: 0n, vatMnt: 0n, refundsMnt: 0n, fuelLitersMilli: 0n }]),
    );
    if (stationIds.length === 0) return out;

    const saleWhere = {
      stationId: { in: stationIds },
      deletedAt: null,
      soldAt: { gte: start, lt: end },
      status: { not: SaleStatus.VOIDED },
    };

    const [salesAgg, refundAgg, fuelRows] = await Promise.all([
      this.prisma.sale.groupBy({ by: ['stationId'], where: saleWhere, _sum: { totalMnt: true, vatMnt: true }, _count: { _all: true } }),
      // `refund.stationId` нь ҮРГЭЛЖ эх борлуулалтын салбар (pos.service.ts дахь ганц
      // үүсгэх цэг нь `sale.stationId`-аас бичдэг) тул салбараар бүлэглэх нь эх
      // борлуулалтаар scope хийсэнтэй ижил утгатай.
      this.prisma.refund.groupBy({ by: ['stationId'], where: { sale: saleWhere }, _sum: { amountMnt: true } }),
      // `sale_line`-д stationId байхгүй тул Prisma groupBy-аар салбараар бүлэглэх боломжгүй.
      // Параметрчилсэн raw (§8: concat үгүй, зөвхөн tagged template). Литрийг milli бүхэл
      // тоогоор нэгтгэнэ — float/Decimal хөрвүүлэлт огт үүсэхгүй (§6).
      this.prisma.$queryRaw<{ stationId: string; litersMilli: bigint }[]>`
        SELECT s.station_id AS "stationId",
               COALESCE(SUM(sl.quantity * 1000), 0)::bigint AS "litersMilli"
        FROM sale_line sl
        JOIN sale s ON s.id = sl.sale_id
        WHERE sl.type = 'FUEL'::"SaleItemType"
          AND s.station_id IN (${Prisma.join(stationIds)})
          AND s.deleted_at IS NULL
          AND s.sold_at >= ${start}
          AND s.sold_at < ${end}
          AND s.status <> 'VOIDED'::"SaleStatus"
        GROUP BY s.station_id`,
    ]);

    for (const r of salesAgg) {
      const t = out.get(r.stationId);
      if (!t) continue;
      t.salesCount = r._count._all;
      t.grossMnt = r._sum.totalMnt ?? 0n;
      t.vatMnt = r._sum.vatMnt ?? 0n;
    }
    for (const r of refundAgg) {
      const t = out.get(r.stationId);
      if (t) t.refundsMnt = r._sum.amountMnt ?? 0n;
    }
    for (const r of fuelRows) {
      const t = out.get(r.stationId);
      if (t) t.fuelLitersMilli = BigInt(r.litersMilli);
    }
    return out;
  }

  // ── Компанийн нэгдсэн өдрийн тайлан ─────────────────────
  async consolidatedReport(user: AuthUser, date: string) {
    const ids = await this.accessibleStationIds(user);
    const { start, end } = ubDayRange(date);
    const stations = await this.prisma.station.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    });
    const nameById = new Map(stations.map((s) => [s.id, s]));

    const totalsById = await this.stationDayTotals(ids, start, end);
    const perStation = ids.map((id) => {
      const s = totalsById.get(id)!;
      const meta = nameById.get(id);
      return {
        stationId: id,
        code: meta?.code ?? null,
        name: meta?.name ?? null,
        salesCount: s.salesCount,
        grossMnt: s.grossMnt,
        vatMnt: s.vatMnt,
        refundsMnt: s.refundsMnt,
        netAfterRefundsMnt: s.grossMnt - s.refundsMnt,
        fuelLiters: milliToDecimalString(s.fuelLitersMilli),
      };
    });

    const totals = perStation.reduce(
      (acc, s) => ({
        salesCount: acc.salesCount + s.salesCount,
        grossMnt: acc.grossMnt + s.grossMnt,
        vatMnt: acc.vatMnt + s.vatMnt,
        refundsMnt: acc.refundsMnt + s.refundsMnt,
        netAfterRefundsMnt: acc.netAfterRefundsMnt + s.netAfterRefundsMnt,
      }),
      { salesCount: 0, grossMnt: 0n, vatMnt: 0n, refundsMnt: 0n, netAfterRefundsMnt: 0n },
    );

    return { date, stationCount: ids.length, totals, perStation };
  }

  // ── KPI самбар (салбар хооронд харьцуулалт) ─────────────
  async kpi(user: AuthUser, date?: string) {
    const day = date ?? ubToday();
    const ids = await this.accessibleStationIds(user);
    const { start, end } = ubDayRange(day);
    const stations = await this.prisma.station.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    });
    const meta = new Map(stations.map((s) => [s.id, s]));

    // Салбар бүрд 3 query явуулахын оронд нэг багцаар (§12 гүйцэтгэлийн 3-р дүрэм).
    const totalsById = await this.stationDayTotals(ids, start, end);
    const rows = ids.map((id) => {
      const t = totalsById.get(id)!;
      const m = meta.get(id);
      return {
        stationId: id,
        code: m?.code ?? null,
        name: m?.name ?? null,
        grossMnt: t.grossMnt,
        salesCount: t.salesCount,
        avgTicketMnt: t.salesCount > 0 ? divRoundHalfUp(t.grossMnt, BigInt(t.salesCount)) : 0n,
        refundsMnt: t.refundsMnt,
        netAfterRefundsMnt: t.grossMnt - t.refundsMnt,
        fuelLiters: milliToDecimalString(t.fuelLitersMilli),
      };
    });

    rows.sort((a, b) => (b.grossMnt > a.grossMnt ? 1 : b.grossMnt < a.grossMnt ? -1 : 0));
    return { date: day, stations: rows };
  }

  // ── Грейдээр түлшний маржин (ойролцоо: жигнэсэн дундаж өртөг) ──
  async fuelMargin(user: AuthUser, stationId: string, from: string, to: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const start = ubDayRange(from).start;
    const end = ubDayRange(to).end;
    const saleWhere = {
      stationId,
      deletedAt: null,
      soldAt: { gte: start, lt: end },
      status: { not: SaleStatus.VOIDED },
    };

    const [sold, deliveredRange, deliveredAll, grades] = await Promise.all([
      this.prisma.saleLine.groupBy({
        by: ['fuelGradeId'],
        where: { type: 'FUEL', sale: saleWhere },
        _sum: { quantity: true, lineTotalMnt: true },
      }),
      this.prisma.fuelDelivery.groupBy({
        by: ['fuelGradeId'],
        where: { stationId, status: 'RECEIVED', deletedAt: null, receivedAt: { gte: start, lt: end } },
        _sum: { liters: true, totalCostMnt: true },
      }),
      this.prisma.fuelDelivery.groupBy({
        by: ['fuelGradeId'],
        where: { stationId, status: 'RECEIVED', deletedAt: null },
        _sum: { liters: true, totalCostMnt: true },
      }),
      this.prisma.fuelGrade.findMany({ select: { id: true, code: true } }),
    ]);

    const gradeCode = new Map(grades.map((g) => [g.id, g.code]));
    const delRange = new Map(deliveredRange.map((d) => [d.fuelGradeId, d]));
    const delAll = new Map(deliveredAll.map((d) => [d.fuelGradeId, d]));

    const rows = sold
      .filter((s) => s.fuelGradeId)
      .map((s) => {
        const gradeId = s.fuelGradeId as string;
        const soldQtyMilli = toMilliUnits(s._sum.quantity?.toString() ?? '0');
        const revenueMnt = s._sum.lineTotalMnt ?? 0n;

        // Жигнэсэн дундаж өртөг: тухайн мужид ЭЕРЭГ литр байвал түүгээр, эс бөгөөс бүх түүхээр.
        // (Decimal(0) нь JS-д truthy тул утгыг тоогоор шалгана.)
        const rangeRow = delRange.get(gradeId);
        const rangeQtyMilli = rangeRow ? toMilliUnits(rangeRow._sum.liters?.toString() ?? '0') : 0n;
        const del = rangeQtyMilli > 0n ? rangeRow : delAll.get(gradeId);
        const delQtyMilli = del ? toMilliUnits(del._sum.liters?.toString() ?? '0') : 0n;
        const delCost = del?._sum.totalCostMnt ?? 0n;

        let cogsMnt: bigint | null = null;
        let marginMnt: bigint | null = null;
        let marginPct: number | null = null;
        if (delQtyMilli > 0n) {
          cogsMnt = divRoundHalfUp(soldQtyMilli * delCost, delQtyMilli);
          marginMnt = revenueMnt - cogsMnt;
          marginPct = revenueMnt > 0n ? Number((marginMnt * 10000n) / revenueMnt) / 100 : null;
        }

        return {
          grade: gradeCode.get(gradeId) ?? null,
          liters: s._sum.quantity?.toString() ?? '0',
          revenueMnt,
          cogsMnt,
          marginMnt,
          marginPct,
          costBasis: delQtyMilli > 0n ? 'weighted-avg-delivery' : 'unknown',
        };
      });

    return { stationId, from, to, rows };
  }

  // ── Аномали илрүүлэлт (зөрүү, сэжигтэй буцаалт, цуцлалт) ──
  async anomalies(user: AuthUser, from: string, to: string, stationId?: string) {
    let ids: string[];
    if (stationId) {
      await assertStationAccess(this.prisma, user, stationId);
      ids = [stationId];
    } else {
      ids = await this.accessibleStationIds(user);
    }
    const start = ubDayRange(from).start;
    const end = ubDayRange(to).end;

    const [cashVariances, largeRefunds, voidCount] = await Promise.all([
      this.prisma.cashReconciliation.findMany({
        where: { stationId: { in: ids }, createdAt: { gte: start, lt: end }, varianceMnt: { not: 0n } },
        select: { id: true, shiftId: true, stationId: true, expectedCashMnt: true, countedCashMnt: true, varianceMnt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.refund.findMany({
        where: {
          stationId: { in: ids },
          createdAt: { gte: start, lt: end },
          amountMnt: { gte: LARGE_REFUND_THRESHOLD },
          sale: { deletedAt: null, status: { not: SaleStatus.VOIDED } },
        },
        select: { id: true, saleId: true, stationId: true, amountMnt: true, reason: true, actorId: true, createdAt: true },
        orderBy: { amountMnt: 'desc' },
      }),
      this.prisma.sale.count({
        where: { stationId: { in: ids }, deletedAt: null, status: SaleStatus.VOIDED, soldAt: { gte: start, lt: end } },
      }),
    ]);

    return {
      from,
      to,
      cashVariances,
      largeRefunds,
      voidCount,
      thresholdMnt: LARGE_REFUND_THRESHOLD,
    };
  }

  /**
   * Борлуулалтын тайлан — огнооны муж + шүүлтүүр (харилцагч/түлш/бараа/кассчин/хэлбэр).
   * Тохирох борлуулалт БҮРИЙГ мөрийн задаргаатай + грейд/бараа/хэлбэр/харилцагчаар нэгтгэл.
   */
  async salesReport(user: AuthUser, q: SalesReportQuery) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    const start = ubDayRange(q.from).start;
    const end = ubDayRange(q.to).end;

    const where: Prisma.SaleWhereInput = {
      stationId: { in: stationIds },
      deletedAt: null,
      soldAt: { gte: start, lt: end },
      // Тайланд цуцлалтыг хасна; гэхдээ status шүүлт өгсөн бол түүгээр (REFUNDED/VOIDED харах).
      status: q.status ?? { not: SaleStatus.VOIDED },
    };
    if (q.cashierId) where.cashierId = q.cashierId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.method) where.payments = { some: { method: q.method } };
    if (q.fuelGradeId || q.productId) {
      where.lines = { some: { ...(q.fuelGradeId ? { fuelGradeId: q.fuelGradeId } : {}), ...(q.productId ? { productId: q.productId } : {}) } };
    }
    if (q.search) {
      where.OR = [
        { saleNumber: { contains: q.search, mode: 'insensitive' } },
        { customerTin: { contains: q.search } },
        { customer: { name: { contains: q.search, mode: 'insensitive' } } },
      ];
    }

    const CAP = q.itemCap; // per-sale жагсаалтын дээд хязгаар (зөвхөн items-д); нийт/нэгтгэлийг DB aggregate-аар бүтнээр.
    const [rows, salesAgg, refundAgg, methodAgg, lineAgg, customerAgg] = await Promise.all([
      // ГҮЙЦЭТГЭЛ: зөвхөн харагдацад хэрэгтэй баганыг сонгоно. Мөрийн (SaleLine) задаргааг
      // ЭНД татахгүй — грейд/барааны задаргаа `byGrade`/`byProduct` нэгтгэлээр бүтнээр гардаг
      // (5000 борлуулалтын ~10k мөрийг татаж хаях нь тайланг 6 дахин удаашруулдаг байсан).
      this.prisma.sale.findMany({
        where,
        select: {
          id: true,
          saleNumber: true,
          stationId: true,
          soldAt: true,
          status: true,
          cashierId: true,
          customerId: true,
          subtotalMnt: true,
          vatMnt: true,
          totalMnt: true,
          payments: { select: { method: true, amountMnt: true } },
        },
        orderBy: { soldAt: 'asc' },
        take: CAP,
      }),
      // Нийт тоо/дүн/НӨАТ + хэлбэр/грейд/бараа/харилцагч нэгтгэлийг БҮХ тохирох мөрөөр (CAP-аас хамааралгүй).
      // Тоог мөн ЭНД авна — тусдаа `sale.count` нь яг ижил бүтэн скан давхардуулдаг байсан.
      this.prisma.sale.aggregate({ where, _sum: { totalMnt: true, vatMnt: true }, _count: { _all: true } }),
      this.prisma.refund.aggregate({ where: { sale: where }, _sum: { amountMnt: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { sale: where }, _sum: { amountMnt: true } }),
      // Түлш/бараа хоёрыг НЭГ л удаа скан хийж задална (өмнө нь 2 тусдаа groupBy нь
      // sale_line-ийг 2 удаа бүтнээр уншдаг байсан: 153ms+110ms → 131ms).
      this.prisma.saleLine.groupBy({ by: ['type', 'fuelGradeId', 'productId'], where: { sale: where }, _sum: { lineTotalMnt: true, quantity: true } }),
      this.prisma.sale.groupBy({ by: ['customerId'], where: { ...where, customerId: { not: null } }, _sum: { totalMnt: true } }),
    ]);

    // Нэг сканаас гарсан мөрийн нэгтгэлийг түлш/бараагаар салгана. Түлшийг грейдээр,
    // бараагаар нь бараагаар дахин нийлбэрлэнэ (өмнөх 2 groupBy-тай яг ижил үр дүн).
    // Тоо хэмжээ = Decimal — JS float ХЭРЭГЛЭХГҮЙ (§6), Decimal.plus-ээр нэмнэ.
    const foldLines = (type: 'FUEL' | 'PRODUCT', key: 'fuelGradeId' | 'productId') => {
      const acc = new Map<string | null, { amount: bigint; qty: Prisma.Decimal }>();
      for (const r of lineAgg) {
        if (r.type !== type) continue;
        const k = r[key];
        const cur = acc.get(k) ?? { amount: 0n, qty: new Prisma.Decimal(0) };
        acc.set(k, {
          amount: cur.amount + (r._sum.lineTotalMnt ?? 0n),
          qty: cur.qty.plus(r._sum.quantity ?? 0),
        });
      }
      return [...acc.entries()].map(([k, v]) => ({ key: k, amountMnt: v.amount, quantity: v.qty }));
    };
    const gradeAgg = foldLines('FUEL', 'fuelGradeId');
    const productAgg = foldLines('PRODUCT', 'productId');

    // Нэр шийдвэрлэх — items-ийн (rows) + нэгтгэлийн (aggregate) ID-уудыг хосолж багцалж.
    const cashierIds = [...new Set(rows.map((s) => s.cashierId))];
    const gradeIds = [...new Set(gradeAgg.map((g) => g.key).filter((x): x is string => !!x))];
    const productIds = [...new Set(productAgg.map((p) => p.key).filter((x): x is string => !!x))];
    const customerIds = [...new Set([...rows.map((s) => s.customerId), ...customerAgg.map((c) => c.customerId)].filter((x): x is string => !!x))];
    const [emps, custs, stations, grades, products] = await Promise.all([
      cashierIds.length ? this.prisma.employee.findMany({ where: { id: { in: cashierIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
      customerIds.length ? this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      this.prisma.station.findMany({ where: { id: { in: stationIds } }, select: { id: true, code: true, name: true } }),
      gradeIds.length ? this.prisma.fuelGrade.findMany({ where: { id: { in: gradeIds } }, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } }) : Promise.resolve([]),
    ]);
    const cashierName = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));
    const customerName = new Map(custs.map((c) => [c.id, c.name]));
    const stationName = new Map(stations.map((s) => [s.id, `${s.code} — ${s.name}`]));
    const gradeName = new Map(grades.map((g) => [g.id, g.code]));
    const productName = new Map(products.map((p) => [p.id, p.name]));

    const total = salesAgg._count._all;
    const grossMnt = salesAgg._sum.totalMnt ?? 0n;
    const vatMnt = salesAgg._sum.vatMnt ?? 0n;
    const refundsMnt = refundAgg._sum.amountMnt ?? 0n;
    const byMethod: Record<string, bigint> = {};
    for (const m of methodAgg) byMethod[m.method] = m._sum.amountMnt ?? 0n;

    // Per-sale жагсаалт (зөвхөн харагдац — CAP хүртэл; нийтэд нөлөөлөхгүй).
    const items = rows.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      stationLabel: stationName.get(s.stationId) ?? null,
      soldAt: s.soldAt,
      status: s.status,
      cashierName: cashierName.get(s.cashierId) ?? null,
      customerName: s.customerId ? (customerName.get(s.customerId) ?? null) : null,
      subtotalMnt: s.subtotalMnt,
      vatMnt: s.vatMnt,
      totalMnt: s.totalMnt,
      methods: s.payments.map((p) => ({ method: p.method, amountMnt: p.amountMnt })),
    }));

    return {
      from: q.from,
      to: q.to,
      filters: { stationId: q.stationId ?? null, cashierId: q.cashierId ?? null, customerId: q.customerId ?? null, fuelGradeId: q.fuelGradeId ?? null, productId: q.productId ?? null, method: q.method ?? null, status: q.status ?? null },
      truncated: total > CAP, // зөвхөн items жагсаалт таслагдсан эсэх (нийт/нэгтгэл бүтэн)
      totals: { count: total, grossMnt, vatMnt, netMnt: grossMnt - vatMnt, refundsMnt, netAfterRefundsMnt: grossMnt - refundsMnt },
      byGrade: gradeAgg.filter((g) => g.key).map((g) => ({ grade: gradeName.get(g.key as string) ?? (g.key as string), liters: g.quantity.toString(), amountMnt: g.amountMnt })),
      byProduct: productAgg.filter((p) => p.key).map((p) => ({ product: productName.get(p.key as string) ?? (p.key as string), quantity: p.quantity.toString(), amountMnt: p.amountMnt })),
      byMethod,
      byCustomer: customerAgg.filter((c) => c.customerId).map((c) => ({ customer: customerName.get(c.customerId as string) ?? (c.customerId as string), amountMnt: c._sum.totalMnt ?? 0n })),
      items,
    };
  }

  /**
   * НӨАТ-ын тайлан (output VAT 10%, §12) — муж дахь борлуулалтын НӨАТ, татвартай/чөлөөлөгдсөн
   * задаргаа, буцаалтын НӨАТ хасагдсан цэвэр. Эх сурвалж: SaleLine.vatMnt + RefundItem.vatMnt.
   */
  async vatReport(user: AuthUser, q: OptionalStationRange) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    const start = ubDayRange(q.from).start;
    const end = ubDayRange(q.to).end;
    const saleWhere = { stationId: { in: stationIds }, deletedAt: null, soldAt: { gte: start, lt: end }, status: { not: SaleStatus.VOIDED } };

    const [vatableAgg, exemptAgg, refundAgg, salesAgg] = await Promise.all([
      // Татвартай = түлш (үргэлж НӨАТ-тай) ЭСВЭЛ vatable бараа. (vatMnt>0 биш — ≤5₮ мөрд НӨАТ
      // 0 болж бөөрөнхийлөгдөвч мөр өөрөө татвартай хэвээр.)
      this.prisma.saleLine.aggregate({ where: { sale: saleWhere, OR: [{ type: 'FUEL' }, { product: { isVatable: true } }] }, _sum: { lineTotalMnt: true, vatMnt: true } }),
      this.prisma.saleLine.aggregate({ where: { sale: saleWhere, type: 'PRODUCT', product: { isVatable: false } }, _sum: { lineTotalMnt: true } }),
      // Буцаалтын НӨАТ — мөр (RefundItem) дээрх vat, буцаалтын огноогоор
      this.prisma.refundItem.aggregate({
        where: { refund: { stationId: { in: stationIds }, createdAt: { gte: start, lt: end } } },
        _sum: { vatMnt: true, amountMnt: true },
      }),
      this.prisma.sale.aggregate({ where: saleWhere, _sum: { totalMnt: true, vatMnt: true }, _count: true }),
    ]);

    const vatableGross = vatableAgg._sum.lineTotalMnt ?? 0n;
    const outputVat = vatableAgg._sum.vatMnt ?? 0n;
    const vatableNet = vatableGross - outputVat;
    const exemptGross = exemptAgg._sum.lineTotalMnt ?? 0n;
    const refundVat = refundAgg._sum.vatMnt ?? 0n;
    const refundGross = refundAgg._sum.amountMnt ?? 0n;

    return {
      from: q.from,
      to: q.to,
      stationId: q.stationId ?? null,
      salesCount: salesAgg._count,
      grossMnt: salesAgg._sum.totalMnt ?? 0n,
      vatableGrossMnt: vatableGross,
      vatableNetMnt: vatableNet,
      exemptGrossMnt: exemptGross,
      outputVatMnt: outputVat,
      refundVatMnt: refundVat,
      refundGrossMnt: refundGross,
      netVatMnt: outputVat - refundVat,
    };
  }

  // ── CSV экспорт (өдрийн тайлан) ─────────────────────────
  async dailyReportCsv(user: AuthUser, stationId: string, date: string): Promise<string> {
    const r = await this.dailyReport(user, stationId, date);
    const lines: string[] = [];
    lines.push('Үзүүлэлт,Утга');
    lines.push(`Огноо,${r.date}`);
    lines.push(`Салбар,${r.stationId}`);
    lines.push(`Борлуулалтын тоо,${r.salesCount}`);
    lines.push(`Нийт дүн (₮),${r.grossMnt}`);
    lines.push(`НӨАТ (₮),${r.vatMnt}`);
    lines.push(`Цэвэр (₮),${r.netMnt}`);
    lines.push(`Бэлэн (₮),${r.byMethod[PM.CASH]}`);
    lines.push(`Карт (₮),${r.byMethod[PM.CARD]}`);
    lines.push(`Түлшний карт (₮),${r.byMethod[PM.FUEL_CARD]}`);
    lines.push(`Мобайл (₮),${r.byMethod[PM.MOBILE]}`);
    lines.push(`Шилжүүлэг (₮),${r.byMethod[PM.TRANSFER] ?? 0}`);
    lines.push(`Зээл/авлага (₮),${r.byMethod[PM.CREDIT] ?? 0}`);
    lines.push(`Бодит цуглуулсан (₮),${r.collectedMnt}`);
    lines.push(`Дэлгүүрийн бараа (₮),${r.productSalesMnt}`);
    lines.push(`Буцаалт (₮),${r.refundsMnt}`);
    lines.push(`Цуцлалтын тоо,${r.voidCount}`);
    lines.push('');
    lines.push('Грейд,Литр,Дүн (₮)');
    for (const f of r.fuelByGrade) {
      lines.push(`${csvCell(f.grade)},${csvCell(f.liters)},${csvCell(f.amountMnt)}`);
    }
    return lines.join('\n');
  }
}
