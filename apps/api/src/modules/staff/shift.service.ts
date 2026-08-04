import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, SaleStatus, ShiftStatus } from '@prisma/client';
import type {
  RequestCloseShiftInput,
  RequestOpenShiftInput,
  ShiftRejectInput,
  ShiftReportQuery,
} from '@fuel/schemas';
import { AuditAction, type AuthUser, PAYMENT_METHOD_LABEL } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';
import { CashAccountabilityService } from '../cash-accountability/cash-accountability.service';
import { RealtimeEvent, RealtimeGateway } from '../realtime/realtime.gateway';

const shiftInclude = {
  cashiers: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
  reconciliation: true,
  tankReadings: { include: { fuelTank: { select: { id: true, code: true } } } },
  tenders: true,
} satisfies Prisma.ShiftInclude;

const dec = (v: number | string) => new Prisma.Decimal(String(v));

/** Ээлж нээх/хаах батлах урсгал + бэлэн мөнгөний тооцоо — CLAUDE.md §7.3, §2.3, §8. */
@Injectable()
export class ShiftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly cashCases: CashAccountabilityService,
  ) {}

  private emit(companyId: string, stationId: string, shiftId: string, status: string) {
    this.realtime.emitToStation(companyId, stationId, RealtimeEvent.SHIFT_CHANGED, { shiftId, stationId, status });
  }

  /** Ээлжийн төлбөрийн хэлбэр тус бүрийн ТООЦОО = төлсөн − буцаасан (VOIDED-ээс бусад, §7.3). */
  private async expectedByMethod(
    tx: Prisma.TransactionClient,
    shiftId: string,
  ): Promise<Map<PaymentMethod, bigint>> {
    const pays = await tx.payment.groupBy({
      by: ['method'],
      where: { sale: { shiftId, status: { not: SaleStatus.VOIDED } } },
      _sum: { amountMnt: true },
    });
    const refs = await tx.refundLine.groupBy({
      by: ['method'],
      where: { refund: { shiftId } },
      _sum: { amountMnt: true },
    });
    const m = new Map<PaymentMethod, bigint>();
    for (const p of pays) m.set(p.method, p._sum.amountMnt ?? 0n);
    for (const r of refs) m.set(r.method, (m.get(r.method) ?? 0n) - (r._sum.amountMnt ?? 0n));
    return m;
  }

  /**
   * Ээлжийн турш ТҮГЭЭЛТ хийгдсэн савуудын id — хаалтын тооллогод эдгээрийг заавал уншина.
   * Түлшний борлуулалт бүр StockMovement (refType='sale') үүсгэдэг тул түүгээр олно.
   */
  private async dispensedTankIds(tx: Prisma.TransactionClient, shiftId: string): Promise<string[]> {
    const saleIds = await tx.sale.findMany({
      where: { shiftId, deletedAt: null, status: { not: SaleStatus.VOIDED } },
      select: { id: true },
    });
    if (saleIds.length === 0) return [];
    const moves = await tx.stockMovement.findMany({
      where: { refType: 'sale', refId: { in: saleIds.map((s) => s.id) }, fuelTankId: { not: null } },
      select: { fuelTankId: true },
      distinct: ['fuelTankId'],
    });
    return moves.map((m) => m.fuelTankId).filter((x): x is string => !!x);
  }

  /** Савны хэмжээний tankId бүр тухайн салбарт харьяалагдахыг шалгана (§10 cross-tenant хаах). */
  private async assertTanks(tx: Prisma.TransactionClient, stationId: string, tankIds: string[]) {
    const unique = [...new Set(tankIds)];
    if (unique.length === 0) return;
    const found = await tx.fuelTank.findMany({
      where: { id: { in: unique }, stationId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException({ code: 'TANK_NOT_FOUND', message: 'Сав энэ салбарт олдсонгүй' });
    }
  }

  /** Өөрийн илгээсэн хүсэлтийг батлахыг хориглоно (owner/admin-аас бусдад) — separation of duties. */
  private assertNotSelfApprove(user: AuthUser, requesterId: string | null) {
    const isAdmin = user.roles.some((r) => r === 'ADMIN' || r === 'OWNER');
    if (!isAdmin && requesterId && requesterId === user.employeeId) {
      throw new ForbiddenException({ code: 'SELF_APPROVE', message: 'Өөрийн илгээсэн хүсэлтийг батлах боломжгүй' });
    }
  }

  // ── Ээлж эхлүүлэх ХҮСЭЛТ (кассчин) ──────────────────────
  async requestOpen(user: AuthUser, input: RequestOpenShiftInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    // Нэг салбарт зэрэг нэг л идэвхтэй (хаагдаагүй) ээлж — өмнөхөө хаатал шинээр нээхгүй.
    const existing = await this.prisma.shift.findFirst({
      where: { stationId: input.stationId, status: { not: ShiftStatus.CLOSED } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SHIFT_ACTIVE',
        message: 'Энэ салбарт идэвхтэй ээлж байна — өмнөх ажилтан ээлжээ хаагаагүй байна',
      });
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await this.assertTanks(tx, input.stationId, input.tankReadings.map((r) => r.tankId));
        const shift = await tx.shift.create({
          data: {
            stationId: input.stationId,
            status: ShiftStatus.PENDING_OPEN,
            openedById: user.employeeId,
            openingCashMnt: input.openingCashMnt,
            note: input.note ?? null,
            cashiers: { create: [{ employeeId: user.employeeId }] },
            tankReadings: {
              create: input.tankReadings.map((r) => ({
                fuelTankId: r.tankId,
                phase: 'OPEN',
                centimeters: dec(r.centimeters),
                liters: r.liters != null ? dec(r.liters) : null,
                imageUrl: r.imageUrl || null,
                actorId: user.sub,
              })),
            },
          },
          include: shiftInclude,
        });
        await this.audit.record(
          { actorId: user.sub, action: AuditAction.SHIFT_OPEN, entity: 'Shift', entityId: shift.id, after: { request: 'open', shift }, stationId: input.stationId, ip },
          tx,
        );
        return shift;
      });
      this.emit(user.companyId, input.stationId, created.id, ShiftStatus.PENDING_OPEN);
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'SHIFT_ACTIVE', message: 'Энэ салбарт идэвхтэй ээлж байна' });
      }
      throw err;
    }
  }

  // ── Нээлтийг БАТЛАХ (нягтлан/админ) ─────────────────────
  async approveOpen(user: AuthUser, shiftId: string, ip: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({ where: { id: shiftId } });
      if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
      await assertStationAccess(tx, user, shift.stationId);
      if (shift.status !== ShiftStatus.PENDING_OPEN) {
        throw new ConflictException({ code: 'NOT_PENDING_OPEN', message: 'Нээлтийн хүсэлт биш байна' });
      }
      this.assertNotSelfApprove(user, shift.openedById);
      const updated = await tx.shift.update({
        where: { id: shiftId },
        data: { status: ShiftStatus.OPEN, openApprovedById: user.employeeId, openApprovedAt: new Date() },
        include: shiftInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SHIFT_OPEN, entity: 'Shift', entityId: shiftId, before: shift, after: { approved: 'open', shift: updated }, stationId: shift.stationId, ip },
        tx,
      );
      return updated;
    });
    this.emit(user.companyId, result.stationId, result.id, ShiftStatus.OPEN);
    return result;
  }

  // ── Ээлж хаах ХҮСЭЛТ (кассчин) — савны хэмжээ + хэлбэрээр тушаалт ──
  async requestClose(user: AuthUser, shiftId: string, input: RequestCloseShiftInput, ip: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({ where: { id: shiftId }, include: { cashiers: true } });
      if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
      await assertStationAccess(tx, user, shift.stationId);
      if (shift.status !== ShiftStatus.OPEN) {
        throw new ConflictException({ code: 'SHIFT_NOT_OPEN', message: 'Идэвхтэй ээлж биш байна' });
      }
      // Зөвхөн ээлжийн ажилтан өөрөө (эсвэл ахлагч/менежер/админ) хаах хүсэлт илгээнэ
      const isMember = shift.cashiers.some((c) => c.employeeId === user.employeeId);
      const elevated = user.roles.some(
        (r) => r === 'SHIFT_SUPERVISOR' || r === 'STATION_MANAGER' || r === 'ADMIN' || r === 'OWNER',
      );
      if (!isMember && !elevated) {
        throw new ForbiddenException({ code: 'NOT_SHIFT_CASHIER', message: 'Зөвхөн ээлжийн ажилтан/ахлагч хаах хүсэлт илгээнэ' });
      }
      await this.assertTanks(tx, shift.stationId, input.tankReadings.map((r) => r.tankId));
      const exp = await this.expectedByMethod(tx, shiftId);
      // ЗААВАЛ ТУЛГАЛТ — хөдөлгөөнтэй байсан төлбөрийн хэлбэр бүрд тушаалт заавал зарлана
      // (0 гэж зарлаж болно, ГЭХДЭЭ ил тод зарлах ёстой). Үүнгүйгээр тооллогогүй хааж,
      // кассын зөрүү илрэхгүй өнгөрдөг байв.
      const declared = new Set(input.tenders.map((t) => t.method));
      const missing = [...exp.entries()]
        .filter(([m, amount]) => amount !== 0n && !declared.has(m))
        .map(([m]) => PAYMENT_METHOD_LABEL[m]);
      if (missing.length > 0) {
        throw new BadRequestException({
          code: 'TENDER_DECLARATION_REQUIRED',
          message: `Тушаалт заавал зарлана: ${missing.join(', ')}`,
        });
      }
      // Ээлжийн турш ТҮГЭЭСЭН сав бүрд хаалтын хэмжээ заавал (тооллого).
      const usedTankIds = await this.dispensedTankIds(tx, shiftId);
      const readTankIds = new Set(input.tankReadings.map((r) => r.tankId));
      const missingTanks = usedTankIds.filter((id) => !readTankIds.has(id));
      if (missingTanks.length > 0) {
        const tanks = await tx.fuelTank.findMany({ where: { id: { in: missingTanks } }, select: { code: true } });
        throw new BadRequestException({
          code: 'TANK_READING_REQUIRED',
          message: `Савны хаалтын хэмжээ заавал: ${tanks.map((t) => t.code).join(', ')}`,
        });
      }
      // Тушаалт = хэлбэр тус бүрээр declared vs expected (хүсэлт давтагдвал дахин бичнэ)
      const methods = new Set<PaymentMethod>([...exp.keys(), ...input.tenders.map((t) => t.method)]);
      await tx.shiftTender.deleteMany({ where: { shiftId } });
      await tx.shiftTender.createMany({
        data: [...methods].map((m) => ({
          shiftId,
          method: m,
          declaredMnt: input.tenders.find((t) => t.method === m)?.declaredMnt ?? 0n,
          expectedMnt: exp.get(m) ?? 0n,
        })),
      });
      // Хаалтын савны хэмжээ
      await tx.shiftTankReading.deleteMany({ where: { shiftId, phase: 'CLOSE' } });
      if (input.tankReadings.length > 0) {
        await tx.shiftTankReading.createMany({
          data: input.tankReadings.map((r) => ({
            shiftId,
            fuelTankId: r.tankId,
            phase: 'CLOSE',
            centimeters: dec(r.centimeters),
            liters: r.liters != null ? dec(r.liters) : null,
            imageUrl: r.imageUrl || null,
            actorId: user.sub,
          })),
        });
      }
      const updated = await tx.shift.update({
        where: { id: shiftId },
        data: {
          status: ShiftStatus.PENDING_CLOSE,
          closeRequestedById: user.employeeId,
          closeRequestedAt: new Date(),
          closingCashMnt: input.countedCashMnt,
          // Хүлээгдэх бэлэн = эхлэх + цуглуулсан бэлэн − бэлэн буцаалт (хяналтын самбарт харагдана)
          expectedCashMnt: shift.openingCashMnt + (exp.get(PaymentMethod.CASH) ?? 0n),
          note: input.note ?? shift.note,
        },
        include: shiftInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SHIFT_CLOSE, entity: 'Shift', entityId: shiftId, before: shift, after: { request: 'close', shift: updated }, stationId: shift.stationId, ip },
        tx,
      );
      return updated;
    });
    this.emit(user.companyId, result.stationId, result.id, ShiftStatus.PENDING_CLOSE);
    return result;
  }

  // ── Хаалтыг БАТЛАХ (нягтлан/админ) — тооцоо нийлүүлж хаана ──
  async approveClose(user: AuthUser, shiftId: string, ip: string | null) {
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const shift = await tx.shift.findFirst({ where: { id: shiftId }, include: { cashiers: true } });
        if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
        await assertStationAccess(tx, user, shift.stationId);
        if (shift.status !== ShiftStatus.PENDING_CLOSE) {
          throw new ConflictException({ code: 'NOT_PENDING_CLOSE', message: 'Хаалтын хүсэлт биш байна' });
        }
        this.assertNotSelfApprove(user, shift.closeRequestedById);
        const countedCash = shift.closingCashMnt ?? 0n;
        const exp = await this.expectedByMethod(tx, shiftId);
        const expectedCashMnt = shift.openingCashMnt + (exp.get(PaymentMethod.CASH) ?? 0n);
        const varianceMnt = countedCash - expectedCashMnt;
        // Тушаалтын ТООЦОО-г шинэчилнэ (хүсэлт-батлалтын хооронд void болсон тохиолдолд шинэ дүн)
        const tenders = await tx.shiftTender.findMany({ where: { shiftId } });
        for (const t of tenders) {
          const cur = exp.get(t.method) ?? 0n;
          if (cur !== t.expectedMnt) await tx.shiftTender.update({ where: { id: t.id }, data: { expectedMnt: cur } });
        }
        const updated = await tx.shift.update({
          where: { id: shiftId },
          data: { status: ShiftStatus.CLOSED, closedById: user.employeeId, closedAt: new Date(), expectedCashMnt },
          include: shiftInclude,
        });
        const reconciliation = await tx.cashReconciliation.create({
          data: { shiftId, stationId: shift.stationId, expectedCashMnt, countedCashMnt: countedCash, varianceMnt, reconciledById: user.employeeId },
        });
        // Зөрүү гарвал кассын хариуцлагын хэрэг + GL бичилт (дутагдал→авлага, илүүдэл→орлого).
        // Хариуцагч = хаах хүсэлт илгээсэн, эс бөгөөс нээсэн/ээлжийн кассчин.
        const responsibleId = shift.closeRequestedById ?? shift.openedById ?? shift.cashiers[0]?.employeeId ?? null;
        const cashCase = responsibleId
          ? await this.cashCases.openCaseInTx(tx, {
              companyId: user.companyId,
              stationId: shift.stationId,
              shiftId,
              employeeId: responsibleId,
              varianceMnt,
              actorId: user.sub,
              ip,
            })
          : null;
        await this.audit.record(
          { actorId: user.sub, action: AuditAction.SHIFT_CLOSE, entity: 'Shift', entityId: shiftId, before: shift, after: { approved: 'close', shift: updated, reconciliation, cashCaseId: cashCase?.id ?? null }, stationId: shift.stationId, ip },
          tx,
        );
        return { shift: updated, reconciliation, cashCase };
      });
    } catch (err) {
      // CashReconciliation @unique(shiftId) — зэрэгцээ давхар батлалт (race)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_CLOSED', message: 'Ээлж аль хэдийн хаагдсан байна' });
      }
      throw err;
    }
    this.emit(user.companyId, result.shift.stationId, result.shift.id, ShiftStatus.CLOSED);
    return result;
  }

  // ── Хүсэлт ТАТГАЛЗАХ (нягтлан/админ) ────────────────────
  async reject(user: AuthUser, shiftId: string, input: ShiftRejectInput, ip: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({ where: { id: shiftId } });
      if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
      await assertStationAccess(tx, user, shift.stationId);
      if (shift.status === ShiftStatus.PENDING_OPEN) {
        // Нээлтийн хүсэлт татгалзах → ээлж устгаж салбарыг чөлөөлнө (cascade)
        await tx.shift.delete({ where: { id: shiftId } });
        await this.audit.record(
          { actorId: user.sub, action: AuditAction.SHIFT_OPEN, entity: 'Shift', entityId: shiftId, before: shift, after: { rejected: 'open', reason: input.reason ?? null }, stationId: shift.stationId, ip },
          tx,
        );
        return { id: shiftId, stationId: shift.stationId, status: 'REJECTED' as const };
      }
      if (shift.status === ShiftStatus.PENDING_CLOSE) {
        // Хаалтын хүсэлт татгалзах → OPEN руу буцааж дахин ажиллуулна
        await tx.shiftTankReading.deleteMany({ where: { shiftId, phase: 'CLOSE' } });
        await tx.shiftTender.deleteMany({ where: { shiftId } });
        const updated = await tx.shift.update({
          where: { id: shiftId },
          data: { status: ShiftStatus.OPEN, closeRequestedById: null, closeRequestedAt: null, closingCashMnt: null },
          include: shiftInclude,
        });
        await this.audit.record(
          { actorId: user.sub, action: AuditAction.SHIFT_CLOSE, entity: 'Shift', entityId: shiftId, before: shift, after: { rejected: 'close', reason: input.reason ?? null }, stationId: shift.stationId, ip },
          tx,
        );
        return updated;
      }
      throw new ConflictException({ code: 'NOT_PENDING', message: 'Хүлээгдэж буй хүсэлт биш байна' });
    });
    const stationId = 'stationId' in result ? result.stationId : (result as { stationId: string }).stationId;
    const status = 'status' in result ? (result.status as string) : ShiftStatus.OPEN;
    this.emit(user.companyId, stationId, ('id' in result ? result.id : shiftId) as string, status);
    return result;
  }

  /**
   * Хаалтад ЮУГ ЗААВАЛ бөглөхийг буцаана — гар утасны дэлгэц үүнийг харуулж чиглүүлнэ.
   * requestClose-ийн шалгалттай ИЖИЛ эх сурвалжийг ашиглана (UI ба сервер зөрөхгүй).
   */
  async closeRequirements(user: AuthUser, shiftId: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id: shiftId }, select: { id: true, stationId: true, status: true } });
    if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
    await assertStationAccess(this.prisma, user, shift.stationId);
    const exp = await this.expectedByMethod(this.prisma, shiftId);
    const tankIds = await this.dispensedTankIds(this.prisma, shiftId);
    const tanks = tankIds.length
      ? await this.prisma.fuelTank.findMany({ where: { id: { in: tankIds } }, select: { id: true, code: true } })
      : [];
    return {
      shiftId,
      status: shift.status,
      // Хөдөлгөөнтэй байсан хэлбэрүүд — тушаалт заавал зарлана
      methods: [...exp.entries()]
        .filter(([, amount]) => amount !== 0n)
        .map(([method, expectedMnt]) => ({ method, label: PAYMENT_METHOD_LABEL[method], expectedMnt })),
      // Түгээлт хийгдсэн савууд — хаалтын хэмжээ заавал
      tanks,
    };
  }

  // ── Тухайн салбарын одоогийн (хаагдаагүй) ээлж ──────────
  async current(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    return this.prisma.shift.findFirst({
      where: { stationId, status: { not: ShiftStatus.CLOSED } },
      include: shiftInclude,
      orderBy: { openedAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id }, include: shiftInclude });
    if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
    await assertStationAccess(this.prisma, user, shift.stationId);
    return shift;
  }

  // ── Хяналтын самбар: салбар бүрийн төлөв + өнөөдрийн орлого + хүлээгдэж буй хүсэлт ──
  async overview(user: AuthUser) {
    const stations = await this.prisma.station.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(user.allStations ? {} : { id: { in: user.stationIds } }),
      },
      orderBy: { code: 'asc' },
    });
    const ids = stations.map((s) => s.id);

    // Өнөөдрийн UB өдрийн хязгаар (UTC+8)
    const ubDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const start = new Date(`${ubDate}T00:00:00+08:00`);
    const end = new Date(`${ubDate}T00:00:00+08:00`);
    end.setUTCDate(end.getUTCDate() + 1);

    // ГҮЙЦЭТГЭЛ: салбар бүрд тусад нь query явуулахын оронд (N салбар × 3 = N+1 асуудал)
    // БҮХ салбарынхыг 3 query-гээр нэг дор татаж, санах ойд бүлэглэнэ.
    const saleWhereAll = {
      stationId: { in: ids },
      deletedAt: null,
      status: { not: SaleStatus.VOIDED },
      soldAt: { gte: start, lt: end },
    };
    const [openShifts, salesByStation, tenderRows] = await Promise.all([
      this.prisma.shift.findMany({
        where: { stationId: { in: ids }, status: { not: ShiftStatus.CLOSED } },
        include: { cashiers: { include: { employee: { select: { firstName: true, lastName: true } } } } },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.sale.groupBy({
        by: ['stationId'],
        where: saleWhereAll,
        _sum: { totalMnt: true },
        _count: { _all: true },
      }),
      // Салбар × төлбөрийн хэлбэрээр — Prisma groupBy нь холбоосын багана дээр бүлэглэж
      // чаддаггүй тул parameterized raw (§8: concat үгүй).
      this.prisma.$queryRaw<{ station_id: string; method: string; sum: bigint | null }[]>`
        SELECT s.station_id, p.method::text AS method, SUM(p.amount_mnt) AS sum
        FROM payment p
        JOIN sale s ON s.id = p.sale_id
        WHERE s.station_id = ANY(${ids})
          AND s.deleted_at IS NULL
          AND s.status <> 'VOIDED'
          AND s.sold_at >= ${start}
          AND s.sold_at < ${end}
        GROUP BY 1, 2`,
    ]);

    // Салбар бүрийн ХАМГИЙН СҮҮЛИЙН нээлттэй ээлж (orderBy desc тул эхнийх нь)
    const shiftByStation = new Map<string, (typeof openShifts)[number]>();
    for (const sh of openShifts) if (!shiftByStation.has(sh.stationId)) shiftByStation.set(sh.stationId, sh);
    const aggByStation = new Map(salesByStation.map((a) => [a.stationId, a]));
    const methodsByStation = new Map<string, Record<string, bigint>>();
    for (const r of tenderRows) {
      const m = methodsByStation.get(r.station_id) ?? {};
      m[r.method] = BigInt(r.sum ?? 0);
      methodsByStation.set(r.station_id, m);
    }

    const perStation = stations.map((s) => {
      const shift = shiftByStation.get(s.id);
      const agg = aggByStation.get(s.id);
      const cashier = shift?.cashiers[0]?.employee;
      return {
        station: { id: s.id, code: s.code, name: s.name },
        shift: shift
          ? {
              id: shift.id,
              status: shift.status,
              openedAt: shift.openedAt,
              cashierName: cashier ? `${cashier.firstName} ${cashier.lastName}`.trim() : null,
            }
          : null,
        salesCount: agg?._count._all ?? 0,
        todayGrossMnt: agg?._sum.totalMnt ?? 0n,
        byMethod: methodsByStation.get(s.id) ?? {},
      };
    });

    const pending = await this.prisma.shift.findMany({
      where: { stationId: { in: ids }, status: { in: [ShiftStatus.PENDING_OPEN, ShiftStatus.PENDING_CLOSE] } },
      include: shiftInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const stationName = new Map(stations.map((s) => [s.id, `${s.code} — ${s.name}`]));

    return {
      stations: perStation,
      pending: pending.map((p) => ({ ...p, stationLabel: stationName.get(p.stationId) ?? p.stationId })),
    };
  }

  /** Хандах эрхтэй салбарууд (§10). */
  private async accessibleStationIds(user: AuthUser): Promise<string[]> {
    const stations = await this.prisma.station.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(user.allStations ? {} : { id: { in: user.stationIds } }) },
      select: { id: true },
    });
    return stations.map((s) => s.id);
  }

  // ── Ээлжийн түүх — муж + салбар/кассчин шүүлт (§7.3 тайлан) ──
  async listShifts(user: AuthUser, q: ShiftReportQuery) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    const start = new Date(`${q.from}T00:00:00+08:00`);
    const end = new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    const where: Prisma.ShiftWhereInput = { stationId: { in: stationIds }, openedAt: { gte: start, lt: end } };
    if (q.cashierId) where.cashiers = { some: { employeeId: q.cashierId } };

    const shifts = await this.prisma.shift.findMany({
      where,
      include: { cashiers: { include: { employee: { select: { firstName: true, lastName: true } } } }, reconciliation: true },
      orderBy: { openedAt: 'desc' },
      take: 500,
    });
    const ids = shifts.map((s) => s.id);
    const agg = ids.length
      ? await this.prisma.sale.groupBy({ by: ['shiftId'], where: { shiftId: { in: ids }, deletedAt: null, status: { not: SaleStatus.VOIDED } }, _sum: { totalMnt: true }, _count: true })
      : [];
    const byShift = new Map(agg.map((a) => [a.shiftId, a]));
    const stations = await this.prisma.station.findMany({ where: { id: { in: stationIds } }, select: { id: true, code: true, name: true } });
    const stationName = new Map(stations.map((s) => [s.id, `${s.code} — ${s.name}`]));

    return {
      from: q.from,
      to: q.to,
      shifts: shifts.map((s) => ({
        id: s.id,
        stationId: s.stationId,
        stationLabel: stationName.get(s.stationId) ?? null,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        cashiers: s.cashiers.map((c) => `${c.employee.firstName} ${c.employee.lastName}`.trim()),
        openingCashMnt: s.openingCashMnt,
        closingCashMnt: s.closingCashMnt,
        expectedCashMnt: s.expectedCashMnt,
        varianceMnt: s.reconciliation?.varianceMnt ?? null,
        salesCount: byShift.get(s.id)?._count ?? 0,
        salesTotalMnt: byShift.get(s.id)?._sum.totalMnt ?? 0n,
      })),
    };
  }

  // ── Ээлжийн Z-тайлан (per-shift хаалтын нэгтгэл) ──
  async zReport(user: AuthUser, shiftId: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id: shiftId }, include: shiftInclude });
    if (!shift) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ээлж олдсонгүй' });
    await assertStationAccess(this.prisma, user, shift.stationId);
    const saleWhere = { shiftId, deletedAt: null, status: { not: SaleStatus.VOIDED } };
    const [agg, byMethodRows, fuelRows, refundAgg, grades, station] = await Promise.all([
      this.prisma.sale.aggregate({ where: saleWhere, _sum: { totalMnt: true, vatMnt: true }, _count: true }),
      this.prisma.payment.groupBy({ by: ['method'], where: { sale: saleWhere }, _sum: { amountMnt: true } }),
      this.prisma.saleLine.groupBy({ by: ['fuelGradeId'], where: { type: 'FUEL', sale: saleWhere }, _sum: { quantity: true, lineTotalMnt: true } }),
      // Буцаалтыг ЭХ борлуулалтын ээлжээр (sale.shiftId) — byMethod/sales-тай ижил хэмжүүрээр
      // тооцоо нийлэхэд (refund.shiftId нь буцаалт ХИЙГДСЭН ээлж, өөр хэмжигдэхүүн §7.4).
      this.prisma.refund.aggregate({ where: { sale: saleWhere }, _sum: { amountMnt: true }, _count: true }),
      this.prisma.fuelGrade.findMany({ select: { id: true, code: true } }),
      this.prisma.station.findFirst({ where: { id: shift.stationId }, select: { code: true, name: true } }),
    ]);
    const gradeCode = new Map(grades.map((g) => [g.id, g.code]));
    const byMethod: Record<string, bigint> = {};
    for (const r of byMethodRows) byMethod[r.method] = r._sum.amountMnt ?? 0n;

    return {
      shift: {
        id: shift.id,
        stationLabel: station ? `${station.code} — ${station.name}` : null,
        status: shift.status,
        openedAt: shift.openedAt,
        openApprovedAt: shift.openApprovedAt,
        closeRequestedAt: shift.closeRequestedAt,
        closedAt: shift.closedAt,
        note: shift.note,
        openingCashMnt: shift.openingCashMnt,
        closingCashMnt: shift.closingCashMnt,
        expectedCashMnt: shift.expectedCashMnt,
      },
      cashiers: shift.cashiers.map((c) => `${c.employee.firstName} ${c.employee.lastName}`.trim()),
      tenders: shift.tenders.map((t) => ({ method: t.method, declaredMnt: t.declaredMnt, expectedMnt: t.expectedMnt, varianceMnt: t.declaredMnt - t.expectedMnt })),
      tankReadings: shift.tankReadings.map((r) => ({ tankCode: r.fuelTank.code, phase: r.phase, centimeters: r.centimeters.toString(), liters: r.liters?.toString() ?? null })),
      sales: { count: agg._count, grossMnt: agg._sum.totalMnt ?? 0n, vatMnt: agg._sum.vatMnt ?? 0n },
      byMethod,
      fuelByGrade: fuelRows.map((r) => ({ grade: r.fuelGradeId ? (gradeCode.get(r.fuelGradeId) ?? null) : null, liters: r._sum.quantity?.toString() ?? '0', amountMnt: r._sum.lineTotalMnt ?? 0n })),
      refunds: { count: refundAgg._count, amountMnt: refundAgg._sum.amountMnt ?? 0n },
      reconciliation: shift.reconciliation,
    };
  }
}
