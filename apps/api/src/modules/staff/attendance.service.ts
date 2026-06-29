import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AttendanceDeleteInput,
  type AttendanceQuery,
  type ClockInInput,
  type ClockOutInput,
  computeWorkedMinutes,
  type ManualAttendanceInput,
} from '@fuel/schemas';
import { AuditAction, type AuthUser } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';

const empSelect = { id: true, firstName: true, lastName: true, employeeCode: true } as const;

/**
 * Цаг бүртгэл (attendance) — clock-in/out, гар засвар, лог + нэгтгэл.
 * Салбараар scope (assertStationAccess). Нэг ажилтанд нэг л нээлттэй бичлэг (partial unique).
 * Цаг = бүхэл минут; ажилласан минутыг computeWorkedMinutes-ээр бодно (§13 цэвэр функц).
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Хандах эрхтэй салбарын id-ууд (§10). */
  private async accessibleStationIds(user: AuthUser): Promise<string[]> {
    const stations = await this.prisma.station.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(user.allStations ? {} : { id: { in: user.stationIds } }) },
      select: { id: true },
    });
    return stations.map((s) => s.id);
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
  }

  /** Идэвхтэй ажилтнууд (цаг бүртгэх сонголтод). */
  listEmployees(user: AuthUser) {
    return this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'ACTIVE' },
      select: empSelect,
      orderBy: [{ firstName: 'asc' }],
    });
  }

  // ── Цаг бүртгэх (clock-in) ──
  async clockIn(user: AuthUser, input: ClockInInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    await this.assertEmployee(user.companyId, input.employeeId);
    const at = input.at ? new Date(input.at) : new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rec = await tx.attendance.create({
          data: { employeeId: input.employeeId, stationId: input.stationId, clockIn: at, note: input.note ?? null, recordedById: user.sub },
          include: { employee: { select: empSelect } },
        });
        await this.audit.record(
          { actorId: user.sub, action: AuditAction.ATTENDANCE_CLOCK_IN, entity: 'Attendance', entityId: rec.id, after: rec, stationId: input.stationId, ip },
          tx,
        );
        return rec;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_CLOCKED_IN', message: 'Энэ ажилтан аль хэдийн цагаа бүртгүүлсэн (гараагүй) байна' });
      }
      throw err;
    }
  }

  // ── Гаргах (clock-out) ──
  async clockOut(user: AuthUser, id: string, input: ClockOutInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.attendance.findFirst({ where: { id, deletedAt: null } });
      if (!rec) throw new NotFoundException({ code: 'ATTENDANCE_NOT_FOUND', message: 'Бичлэг олдсонгүй' });
      await assertStationAccess(tx, user, rec.stationId);
      if (rec.clockOut) throw new ConflictException({ code: 'ALREADY_CLOCKED_OUT', message: 'Аль хэдийн гарсан бичлэг байна' });
      const at = input.at ? new Date(input.at) : new Date();
      if (at.getTime() <= rec.clockIn.getTime()) {
        throw new BadRequestException({ code: 'BAD_CLOCK_OUT', message: 'Гарах цаг орох цагаас хойш байх ёстой' });
      }
      const breakMin = input.breakMinutes ?? 0;
      const worked = computeWorkedMinutes(rec.clockIn.getTime(), at.getTime(), breakMin);
      const updated = await tx.attendance.update({
        where: { id },
        data: { clockOut: at, breakMinutes: breakMin, workedMinutes: worked, note: input.note ?? rec.note },
        include: { employee: { select: empSelect } },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.ATTENDANCE_CLOCK_OUT, entity: 'Attendance', entityId: id, before: rec, after: updated, stationId: rec.stationId, ip },
        tx,
      );
      return updated;
    });
  }

  // ── Гар бүртгэл (орц+гарц нэг дор) ──
  async manual(user: AuthUser, input: ManualAttendanceInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    await this.assertEmployee(user.companyId, input.employeeId);
    const ci = new Date(input.clockIn);
    const co = new Date(input.clockOut);
    const breakMin = input.breakMinutes ?? 0;
    const worked = computeWorkedMinutes(ci.getTime(), co.getTime(), breakMin);
    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.attendance.create({
        data: { employeeId: input.employeeId, stationId: input.stationId, clockIn: ci, clockOut: co, breakMinutes: breakMin, workedMinutes: worked, note: input.note ?? null, recordedById: user.sub },
        include: { employee: { select: empSelect } },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.ATTENDANCE_MANUAL, entity: 'Attendance', entityId: rec.id, after: rec, stationId: input.stationId, ip },
        tx,
      );
      return rec;
    });
  }

  // ── Одоо ажиллаж буй (нээлттэй бичлэг) ──
  async current(user: AuthUser, stationId?: string) {
    let stationIds: string[];
    if (stationId) {
      await assertStationAccess(this.prisma, user, stationId);
      stationIds = [stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    return this.prisma.attendance.findMany({
      where: { stationId: { in: stationIds }, clockOut: null, deletedAt: null },
      include: { employee: { select: empSelect }, station: { select: { id: true, code: true, name: true } } },
      orderBy: { clockIn: 'asc' },
    });
  }

  /** Муж + салбар/ажилтан шүүлтийн нэгтгэл (UB өдрийн хязгаар, §2.8). */
  private async scopeForQuery(user: AuthUser, q: AttendanceQuery) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    const start = new Date(`${q.from}T00:00:00+08:00`);
    const end = new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    const where: Prisma.AttendanceWhereInput = { stationId: { in: stationIds }, deletedAt: null, clockIn: { gte: start, lt: end } };
    if (q.employeeId) where.employeeId = q.employeeId;
    return where;
  }

  // ── Лог (мужид) ──
  async list(user: AuthUser, q: AttendanceQuery) {
    const where = await this.scopeForQuery(user, q);
    const rows = await this.prisma.attendance.findMany({
      where,
      include: { employee: { select: empSelect }, station: { select: { id: true, code: true, name: true } } },
      orderBy: { clockIn: 'desc' },
      take: 500,
    });
    return { from: q.from, to: q.to, rows };
  }

  // ── Нэгтгэл (ажилтан бүрийн нийт ажилласан минут + өдөр) ──
  async summary(user: AuthUser, q: AttendanceQuery) {
    const where = await this.scopeForQuery(user, q);
    // Зөвхөн хаагдсан бичлэг (workedMinutes-тэй) нэгтгэнэ.
    const grouped = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: { ...where, clockOut: { not: null } },
      _sum: { workedMinutes: true },
      _count: { _all: true },
    });
    const ids = grouped.map((g) => g.employeeId);
    const emps = ids.length
      ? await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: empSelect })
      : [];
    const byId = new Map(emps.map((e) => [e.id, e]));
    const rows = grouped
      .map((g) => {
        const e = byId.get(g.employeeId);
        return {
          employeeId: g.employeeId,
          name: e ? `${e.lastName} ${e.firstName}`.trim() : g.employeeId,
          employeeCode: e?.employeeCode ?? null,
          shifts: g._count._all,
          workedMinutes: g._sum.workedMinutes ?? 0,
        };
      })
      .sort((a, b) => b.workedMinutes - a.workedMinutes);
    const totalMinutes = rows.reduce((s, r) => s + r.workedMinutes, 0);
    return { from: q.from, to: q.to, totalMinutes, rows };
  }

  // ── Бичлэг устгах (засвар) — soft-delete, шалтгаан заавал (§2.6/§2.7) ──
  async remove(user: AuthUser, id: string, input: AttendanceDeleteInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.attendance.findFirst({ where: { id, deletedAt: null } });
      if (!rec) throw new NotFoundException({ code: 'ATTENDANCE_NOT_FOUND', message: 'Бичлэг олдсонгүй' });
      await assertStationAccess(tx, user, rec.stationId);
      const updated = await tx.attendance.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.ATTENDANCE_DELETE, entity: 'Attendance', entityId: id, before: rec, after: { reason: input.reason }, stationId: rec.stationId, ip },
        tx,
      );
      return { id: updated.id, deleted: true };
    });
  }
}
