import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CashCaseStatus, Prisma } from '@prisma/client';
import {
  allocateDeductions,
  type CashCaseQuery,
  type CashScorecardQuery,
  outstandingMnt,
  type ResolveCashCaseInput,
  varianceKind,
} from '@fuel/schemas';
import { AuditAction, type AuthUser, JournalSource, STD_ACCOUNT } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AccountingService } from '../accounting/accounting.service';
import { AuditService } from '../audit/audit.service';

const empSelect = { id: true, firstName: true, lastName: true, employeeCode: true } as const;
const caseInclude = {
  employee: { select: empSelect },
  station: { select: { id: true, code: true, name: true } },
} satisfies Prisma.CashVarianceCaseInclude;

const abs = (v: bigint) => (v < 0n ? -v : v);

/**
 * Кассын хариуцлага — ээлж хаахад гарсан бэлэн мөнгөний зөрүүг кассчинд холбож шийдвэрлэнэ.
 *
 * GL (EOD нь кассыг ТООЦООЛСОН дүнгээр бичдэг тул зөрүү бичигдээгүй үлддэг — давхар бичилт үүсэхгүй):
 *   дутагдал үүсэх : Дт 1210 Бусад авлага / Кт 1100 Касс      → OPEN
 *   илүүдэл үүсэх  : Дт 1100 Касс / Кт 5900 Бусад орлого       → RESOLVED
 *   бэлнээр нөхөх  : Дт 1100 Касс / Кт 1210
 *   акт (write-off): Дт 7900 Хорогдол / Кт 1210
 *   цалингаас      : PENDING_DEDUCTION → цалин бодоход Кт 1210 (PayrollService)
 */
@Injectable()
export class CashAccountabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Ээлж хаагдахад зөрүүтэй бол хэрэг үүсгэнэ (ShiftService.approveClose-ийн transaction дотроос).
   * Зөрүүгүй бол юу ч хийхгүй. Хэрэг бүрд GL журнал бичнэ (дээрх схемээр).
   */
  async openCaseInTx(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      stationId: string;
      shiftId: string;
      employeeId: string;
      varianceMnt: bigint;
      actorId: string;
      date?: Date;
      ip?: string | null;
    },
  ) {
    const kind = varianceKind(params.varianceMnt);
    if (kind === 'NONE') return null;

    const existing = await tx.cashVarianceCase.findUnique({ where: { shiftId: params.shiftId }, select: { id: true } });
    if (existing) return null; // idempotent — дахин үүсгэхгүй

    const amount = abs(params.varianceMnt);
    const date = params.date ?? new Date();
    const isShortage = kind === 'SHORTAGE';

    const entry = await this.accounting.postJournalInTx(tx, {
      companyId: params.companyId,
      stationId: params.stationId,
      date,
      source: JournalSource.CASH,
      memo: isShortage ? 'Кассын дутагдал (ээлжийн зөрүү)' : 'Кассын илүүдэл (ээлжийн зөрүү)',
      refType: 'cash_variance',
      refId: params.shiftId,
      createdById: params.actorId,
      lines: isShortage
        ? [
            { accountCode: STD_ACCOUNT.OTHER_RECEIVABLE, debitMnt: amount, memo: 'Ажилтны авлага' },
            { accountCode: STD_ACCOUNT.CASH, creditMnt: amount },
          ]
        : [
            { accountCode: STD_ACCOUNT.CASH, debitMnt: amount },
            { accountCode: STD_ACCOUNT.REV_OTHER, creditMnt: amount, memo: 'Кассын илүүдэл' },
          ],
    });

    const rec = await tx.cashVarianceCase.create({
      data: {
        companyId: params.companyId,
        stationId: params.stationId,
        shiftId: params.shiftId,
        employeeId: params.employeeId,
        varianceMnt: params.varianceMnt,
        amountMnt: amount,
        // Илүүдэл нь нөхөх зүйлгүй — шууд орлогод бичигдэж хаагдана.
        status: isShortage ? CashCaseStatus.OPEN : CashCaseStatus.RESOLVED,
        resolution: isShortage ? null : 'OVERAGE_INCOME',
        recoveredMnt: isShortage ? 0n : amount,
        openJournalEntryId: entry.id,
        ...(isShortage ? {} : { decidedById: params.actorId, decidedAt: new Date() }),
      },
    });

    await this.audit.record(
      {
        actorId: params.actorId,
        action: AuditAction.CASH_CASE_OPEN,
        entity: 'CashVarianceCase',
        entityId: rec.id,
        after: rec,
        stationId: params.stationId,
        ip: params.ip ?? null,
      },
      tx,
    );
    return rec;
  }

  private async accessibleStationIds(user: AuthUser): Promise<string[]> {
    const stations = await this.prisma.station.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(user.allStations ? {} : { id: { in: user.stationIds } }) },
      select: { id: true },
    });
    return stations.map((s) => s.id);
  }

  private async scopeWhere(user: AuthUser, q: { stationId?: string; from?: string; to?: string; employeeId?: string }) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    const where: Prisma.CashVarianceCaseWhereInput = { companyId: user.companyId, stationId: { in: stationIds } };
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.from || q.to) {
      const gte = q.from ? new Date(`${q.from}T00:00:00+08:00`) : undefined;
      const lt = q.to ? new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000) : undefined;
      where.createdAt = { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) };
    }
    return where;
  }

  // ── Жагсаалт ──
  async list(user: AuthUser, q: CashCaseQuery) {
    const where = await this.scopeWhere(user, q);
    if (q.status) where.status = q.status;
    const rows = await this.prisma.cashVarianceCase.findMany({
      where,
      include: caseInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    // Нээлттэй авлагын нийт үлдэгдэл (шийдвэрлэх ёстой дүн)
    const open = await this.prisma.cashVarianceCase.findMany({
      where: { ...where, status: { in: [CashCaseStatus.OPEN, CashCaseStatus.PENDING_DEDUCTION] } },
      select: { amountMnt: true, recoveredMnt: true },
    });
    const outstanding = open.reduce((s, c) => s + outstandingMnt(c.amountMnt, c.recoveredMnt), 0n);
    return { rows, openCount: open.length, outstandingMnt: outstanding };
  }

  async get(user: AuthUser, id: string) {
    const rec = await this.prisma.cashVarianceCase.findFirst({
      where: { id, companyId: user.companyId },
      include: { ...caseInclude, shift: { select: { id: true, openedAt: true, closedAt: true } } },
    });
    if (!rec) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Кассын хэрэг олдсонгүй' });
    await assertStationAccess(this.prisma, user, rec.stationId);
    return rec;
  }

  // ── Шийдвэрлэх ──
  async resolve(user: AuthUser, id: string, input: ResolveCashCaseInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.cashVarianceCase.findFirst({ where: { id, companyId: user.companyId } });
      if (!rec) throw new NotFoundException({ code: 'CASE_NOT_FOUND', message: 'Кассын хэрэг олдсонгүй' });
      await assertStationAccess(tx, user, rec.stationId);
      if (rec.status === CashCaseStatus.RESOLVED) {
        throw new ConflictException({ code: 'ALREADY_RESOLVED', message: 'Энэ хэрэг аль хэдийн шийдвэрлэгдсэн' });
      }
      const left = outstandingMnt(rec.amountMnt, rec.recoveredMnt);
      if (left <= 0n) {
        throw new BadRequestException({ code: 'NOTHING_OUTSTANDING', message: 'Нөхөх үлдэгдэл алга' });
      }

      let resolveEntryId: string | null = null;
      let status: CashCaseStatus;
      let recovered = rec.recoveredMnt;

      if (input.resolution === 'DEDUCT_SALARY') {
        // Мөнгө хараахан хөдлөөгүй — цалин бодоход суутгана (PayrollService).
        status = CashCaseStatus.PENDING_DEDUCTION;
      } else {
        const lines =
          input.resolution === 'RECOVERED_CASH'
            ? [
                { accountCode: STD_ACCOUNT.CASH, debitMnt: left, memo: 'Кассчин нөхөв' },
                { accountCode: STD_ACCOUNT.OTHER_RECEIVABLE, creditMnt: left },
              ]
            : [
                { accountCode: STD_ACCOUNT.SHRINKAGE, debitMnt: left, memo: 'Кассын дутагдал — акт' },
                { accountCode: STD_ACCOUNT.OTHER_RECEIVABLE, creditMnt: left },
              ];
        const entry = await this.accounting.postJournalInTx(tx, {
          companyId: user.companyId,
          stationId: rec.stationId,
          date: new Date(),
          source: JournalSource.CASH,
          memo: input.resolution === 'RECOVERED_CASH' ? 'Кассын дутагдал нөхөв' : 'Кассын дутагдал — акт',
          refType: 'cash_variance_resolve',
          refId: rec.id,
          createdById: user.sub,
          lines,
        });
        resolveEntryId = entry.id;
        status = CashCaseStatus.RESOLVED;
        recovered = rec.amountMnt; // үлдэгдэлгүй болов
      }

      const updated = await tx.cashVarianceCase.update({
        where: { id },
        data: {
          status,
          resolution: input.resolution,
          recoveredMnt: recovered,
          note: input.note ?? rec.note,
          resolveJournalEntryId: resolveEntryId,
          decidedById: user.employeeId,
          decidedAt: new Date(),
        },
        include: caseInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.CASH_CASE_RESOLVE, entity: 'CashVarianceCase', entityId: id, before: rec, after: updated, stationId: rec.stationId, ip },
        tx,
      );
      return updated;
    });
  }

  // ── Цалингийн интеграци (PayrollService-ээс дуудна) ──
  /** Ажилтны цалингаас суутгах хүлээгдэж буй хэргүүд (хуучнаас нь эхлэн). */
  /**
   * ОЛОН ажилтны хүлээгдэж буй суутгалыг НЭГ query-гээр (ажилтан бүрд тусад нь
   * хандахгүй — цалин бодоход N+1 үүсгэдэг байсан).
   */
  async pendingDeductionsForManyInTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    employeeIds: string[],
  ): Promise<Map<string, { id: string; amountMnt: bigint; recoveredMnt: bigint }[]>> {
    const out = new Map<string, { id: string; amountMnt: bigint; recoveredMnt: bigint }[]>();
    if (employeeIds.length === 0) return out;
    const rows = await tx.cashVarianceCase.findMany({
      where: { companyId, employeeId: { in: employeeIds }, status: CashCaseStatus.PENDING_DEDUCTION },
      select: { id: true, employeeId: true, amountMnt: true, recoveredMnt: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of rows) {
      const list = out.get(r.employeeId) ?? [];
      list.push({ id: r.id, amountMnt: r.amountMnt, recoveredMnt: r.recoveredMnt });
      out.set(r.employeeId, list);
    }
    return out;
  }

  pendingDeductionsInTx(tx: Prisma.TransactionClient, companyId: string, employeeId: string) {
    return tx.cashVarianceCase.findMany({
      where: { companyId, employeeId, status: CashCaseStatus.PENDING_DEDUCTION },
      select: { id: true, amountMnt: true, recoveredMnt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Гарт олгох дүнгээс хэтрэхгүйгээр суутгалыг хуваарилж, хэргүүдийг шинэчилнэ.
   * Бүрэн нөхөгдсөн хэрэг RESOLVED болно; хэсэгчилсэн нь PENDING_DEDUCTION хэвээр (дараа сард).
   */
  async applyDeductionsInTx(
    tx: Prisma.TransactionClient,
    params: { companyId: string; employeeId: string; availableNetMnt: bigint; payrollRunId: string; actorId: string },
  ): Promise<bigint> {
    const cases = await this.pendingDeductionsInTx(tx, params.companyId, params.employeeId);
    if (cases.length === 0) return 0n;
    const { allocations, totalMnt } = allocateDeductions(params.availableNetMnt, cases);
    for (const a of allocations) {
      const c = cases.find((x) => x.id === a.caseId);
      if (!c) continue;
      await tx.cashVarianceCase.update({
        where: { id: a.caseId },
        data: {
          recoveredMnt: c.recoveredMnt + a.deductMnt,
          ...(a.fullySettled
            ? { status: CashCaseStatus.RESOLVED, payrollRunId: params.payrollRunId, decidedAt: new Date() }
            : { payrollRunId: params.payrollRunId }),
        },
      });
    }
    return totalMnt;
  }

  /**
   * Цалин буцаахад суутгалыг эргүүлнэ — хэргүүд PENDING_DEDUCTION-д, нөхөлт нь буцаж хасагдана.
   * Тухайн ажилтнаас энэ цалингаар суутгасан нийт дүнг (PayrollItem.deductionMnt) сүүлийн хэргээс
   * эхлэн задалж буцаана (суутгал нь хуучин хэргээс эхэлж хийгдсэн тул урвуу дараалал).
   */
  async reverseDeductionsInTx(tx: Prisma.TransactionClient, payrollRunId: string, items: { employeeId: string; deductionMnt: bigint }[]) {
    const rows = await tx.cashVarianceCase.findMany({
      where: { payrollRunId },
      select: { id: true, employeeId: true, recoveredMnt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) return;
    const remaining = new Map(items.map((i) => [i.employeeId, i.deductionMnt]));
    for (const r of rows) {
      const back = remaining.get(r.employeeId) ?? 0n;
      const take = back <= 0n ? 0n : r.recoveredMnt < back ? r.recoveredMnt : back;
      remaining.set(r.employeeId, back - take);
      await tx.cashVarianceCase.update({
        where: { id: r.id },
        data: { recoveredMnt: r.recoveredMnt - take, status: CashCaseStatus.PENDING_DEDUCTION, payrollRunId: null },
      });
    }
  }

  // ── Кассчны үнэлгээ (scorecard) ──
  async scorecard(user: AuthUser, q: CashScorecardQuery) {
    const where = await this.scopeWhere(user, q);
    const rows = await this.prisma.cashVarianceCase.findMany({
      where,
      select: { employeeId: true, varianceMnt: true, amountMnt: true, recoveredMnt: true, status: true },
    });
    const emps = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: empSelect,
    });
    const byId = new Map(emps.map((e) => [e.id, e]));

    const agg = new Map<
      string,
      { cases: number; shortageCount: number; overageCount: number; shortageMnt: bigint; overageMnt: bigint; outstandingMnt: bigint }
    >();
    for (const r of rows) {
      const cur = agg.get(r.employeeId) ?? { cases: 0, shortageCount: 0, overageCount: 0, shortageMnt: 0n, overageMnt: 0n, outstandingMnt: 0n };
      cur.cases += 1;
      if (r.varianceMnt < 0n) {
        cur.shortageCount += 1;
        cur.shortageMnt += abs(r.varianceMnt);
      } else if (r.varianceMnt > 0n) {
        cur.overageCount += 1;
        cur.overageMnt += r.varianceMnt;
      }
      if (r.status !== CashCaseStatus.RESOLVED) cur.outstandingMnt += outstandingMnt(r.amountMnt, r.recoveredMnt);
      agg.set(r.employeeId, cur);
    }

    const list = [...agg.entries()]
      .map(([employeeId, v]) => {
        const e = byId.get(employeeId);
        return {
          employeeId,
          name: e ? `${e.lastName} ${e.firstName}`.trim() : employeeId,
          employeeCode: e?.employeeCode ?? null,
          ...v,
          // Цэвэр зөрүү: илүүдэл − дутагдал (сөрөг = компанид алдагдалтай)
          netVarianceMnt: v.overageMnt - v.shortageMnt,
        };
      })
      .sort((a, b) => (a.shortageMnt === b.shortageMnt ? 0 : a.shortageMnt > b.shortageMnt ? -1 : 1));

    const totals = list.reduce(
      (s, r) => ({
        cases: s.cases + r.cases,
        shortageMnt: s.shortageMnt + r.shortageMnt,
        overageMnt: s.overageMnt + r.overageMnt,
        outstandingMnt: s.outstandingMnt + r.outstandingMnt,
      }),
      { cases: 0, shortageMnt: 0n, overageMnt: 0n, outstandingMnt: 0n },
    );
    return { from: q.from, to: q.to, totals, rows: list };
  }
}
