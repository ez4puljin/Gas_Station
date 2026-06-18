import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import {
  divRoundHalfUp,
  milliToDecimalString,
  type OptionalStationRange,
  type SalesReportQuery,
  toMilliUnits,
} from '@fuel/schemas';
import { type AuthUser, PaymentMethod as PM } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';

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
  constructor(private readonly prisma: PrismaService) {}

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

  // ── Компанийн нэгдсэн өдрийн тайлан ─────────────────────
  async consolidatedReport(user: AuthUser, date: string) {
    const ids = await this.accessibleStationIds(user);
    const { start, end } = ubDayRange(date);
    const stations = await this.prisma.station.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    });
    const nameById = new Map(stations.map((s) => [s.id, s]));

    const perStation = await Promise.all(
      ids.map(async (id) => {
        const s = await this.stationDaySummary(id, start, end);
        const meta = nameById.get(id);
        return {
          stationId: id,
          code: meta?.code ?? null,
          name: meta?.name ?? null,
          salesCount: s.salesCount,
          grossMnt: s.grossMnt,
          vatMnt: s.vatMnt,
          refundsMnt: s.refundsMnt,
          netAfterRefundsMnt: s.netAfterRefundsMnt,
          fuelLiters: s.fuelLiters,
        };
      }),
    );

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

    const rows = await Promise.all(
      ids.map(async (id) => {
        const saleWhere = {
          stationId: id,
          deletedAt: null,
          soldAt: { gte: start, lt: end },
          status: { not: SaleStatus.VOIDED },
        };
        const [salesAgg, fuelAgg, refundAgg] = await Promise.all([
          this.prisma.sale.aggregate({ where: saleWhere, _sum: { totalMnt: true }, _count: true }),
          this.prisma.saleLine.aggregate({
            where: { type: 'FUEL', sale: saleWhere },
            _sum: { quantity: true },
          }),
          this.prisma.refund.aggregate({
            where: {
              sale: { stationId: id, soldAt: { gte: start, lt: end }, deletedAt: null, status: { not: SaleStatus.VOIDED } },
            },
            _sum: { amountMnt: true },
          }),
        ]);
        const gross = salesAgg._sum.totalMnt ?? 0n;
        const count = salesAgg._count;
        const refundsMnt = refundAgg._sum.amountMnt ?? 0n;
        const m = meta.get(id);
        return {
          stationId: id,
          code: m?.code ?? null,
          name: m?.name ?? null,
          grossMnt: gross,
          salesCount: count,
          avgTicketMnt: count > 0 ? divRoundHalfUp(gross, BigInt(count)) : 0n,
          refundsMnt,
          netAfterRefundsMnt: gross - refundsMnt,
          fuelLiters: fuelAgg._sum.quantity?.toString() ?? '0',
        };
      }),
    );

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

    const CAP = 5000; // per-sale жагсаалтын дээд хязгаар (зөвхөн items-д); нийт/нэгтгэлийг DB aggregate-аар бүтнээр.
    const [rows, total, salesAgg, refundAgg, methodAgg, gradeAgg, productAgg, customerAgg] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { lines: true, payments: true },
        orderBy: { soldAt: 'asc' },
        take: CAP,
      }),
      this.prisma.sale.count({ where }),
      // Нийт дүн/НӨАТ + хэлбэр/грейд/бараа/харилцагч нэгтгэлийг БҮХ тохирох мөрөөр (CAP-аас хамааралгүй)
      this.prisma.sale.aggregate({ where, _sum: { totalMnt: true, vatMnt: true } }),
      this.prisma.refund.aggregate({ where: { sale: where }, _sum: { amountMnt: true } }),
      this.prisma.payment.groupBy({ by: ['method'], where: { sale: where }, _sum: { amountMnt: true } }),
      this.prisma.saleLine.groupBy({ by: ['fuelGradeId'], where: { sale: where, type: 'FUEL' }, _sum: { lineTotalMnt: true, quantity: true } }),
      this.prisma.saleLine.groupBy({ by: ['productId'], where: { sale: where, type: 'PRODUCT' }, _sum: { lineTotalMnt: true, quantity: true } }),
      this.prisma.sale.groupBy({ by: ['customerId'], where: { ...where, customerId: { not: null } }, _sum: { totalMnt: true } }),
    ]);

    // Нэр шийдвэрлэх — items-ийн (rows) + нэгтгэлийн (aggregate) ID-уудыг хосолж багцалж.
    const cashierIds = [...new Set(rows.map((s) => s.cashierId))];
    const gradeIds = [...new Set([...rows.flatMap((s) => s.lines.map((l) => l.fuelGradeId)), ...gradeAgg.map((g) => g.fuelGradeId)].filter((x): x is string => !!x))];
    const productIds = [...new Set([...rows.flatMap((s) => s.lines.map((l) => l.productId)), ...productAgg.map((p) => p.productId)].filter((x): x is string => !!x))];
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
      lines: s.lines.map((l) => ({
        type: l.type,
        name: l.description,
        grade: l.fuelGradeId ? (gradeName.get(l.fuelGradeId) ?? null) : null,
        quantity: l.quantity.toString(),
        unitPriceMnt: l.unitPriceMnt,
        lineTotalMnt: l.lineTotalMnt,
      })),
    }));

    return {
      from: q.from,
      to: q.to,
      filters: { stationId: q.stationId ?? null, cashierId: q.cashierId ?? null, customerId: q.customerId ?? null, fuelGradeId: q.fuelGradeId ?? null, productId: q.productId ?? null, method: q.method ?? null, status: q.status ?? null },
      truncated: total > CAP, // зөвхөн items жагсаалт таслагдсан эсэх (нийт/нэгтгэл бүтэн)
      totals: { count: total, grossMnt, vatMnt, netMnt: grossMnt - vatMnt, refundsMnt, netAfterRefundsMnt: grossMnt - refundsMnt },
      byGrade: gradeAgg.filter((g) => g.fuelGradeId).map((g) => ({ grade: gradeName.get(g.fuelGradeId as string) ?? (g.fuelGradeId as string), liters: g._sum.quantity?.toString() ?? '0', amountMnt: g._sum.lineTotalMnt ?? 0n })),
      byProduct: productAgg.filter((p) => p.productId).map((p) => ({ product: productName.get(p.productId as string) ?? (p.productId as string), quantity: p._sum.quantity?.toString() ?? '0', amountMnt: p._sum.lineTotalMnt ?? 0n })),
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
