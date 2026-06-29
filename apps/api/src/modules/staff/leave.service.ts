import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveStatus, Prisma } from '@prisma/client';
import {
  countLeaveDays,
  DEFAULT_ANNUAL_LEAVE_DAYS,
  type LeaveQuery,
  type LeaveRejectInput,
  type LeaveRequestInput,
} from '@fuel/schemas';
import { AuditAction, type AuthUser, RoleKey } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const empSelect = { id: true, firstName: true, lastName: true, employeeCode: true } as const;
const ACTIVE_STATUSES: LeaveStatus[] = [LeaveStatus.PENDING, LeaveStatus.APPROVED];

function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/**
 * Чөлөө (leave) — хүсэлт→батлах/татгалзах урсгал (separation of duties), хоног + жилийн үлдэгдэл.
 * Компани-түвшний (салбараар scope биш — ажилтан компанид харьяалагдана). Бүх үйлдэл audit + transaction.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getEmployee(companyId: string, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true, annualLeaveDays: true },
    });
    if (!emp) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
    return emp;
  }

  private isElevated(user: AuthUser): boolean {
    return user.roles.some((r) => r === RoleKey.ADMIN || r === RoleKey.OWNER);
  }

  /** Шийдвэрлэх эрх (батлах/татгалзах) — менежер/нягтлан/админ/эзэмшигч. */
  private assertCanDecide(user: AuthUser) {
    const ok = user.roles.some(
      (r) => r === RoleKey.STATION_MANAGER || r === RoleKey.ACCOUNTANT || r === RoleKey.ADMIN || r === RoleKey.OWNER,
    );
    if (!ok) throw new ForbiddenException({ code: 'FORBIDDEN_DECIDE', message: 'Чөлөө батлах/татгалзах эрхгүй байна' });
  }

  /** Өөрийн хүсэлтийг өөрөө батлах/татгалзахыг хориглоно (admin/owner-аас бусдад). */
  private assertNotSelf(user: AuthUser, requestedById: string) {
    if (!this.isElevated(user) && requestedById === user.employeeId) {
      throw new ForbiddenException({ code: 'SELF_DECIDE', message: 'Өөрийн хүсэлтийг өөрөө шийдвэрлэх боломжгүй' });
    }
  }

  listEmployees(user: AuthUser) {
    return this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'ACTIVE' },
      select: { ...empSelect, annualLeaveDays: true },
      orderBy: [{ firstName: 'asc' }],
    });
  }

  // ── Хүсэлт гаргах ──
  async request(user: AuthUser, input: LeaveRequestInput, ip: string | null) {
    await this.getEmployee(user.companyId, input.employeeId);
    const days = countLeaveDays(input.startDate, input.endDate);
    const startD = ymdToDate(input.startDate);
    const endD = ymdToDate(input.endDate);

    // Давхцал шалгах — нэг ажилтны идэвхтэй (PENDING/APPROVED) чөлөөтэй огтлолцвол хориглоно.
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: { employeeId: input.employeeId, deletedAt: null, status: { in: ACTIVE_STATUSES }, startDate: { lte: endD }, endDate: { gte: startD } },
      select: { id: true, startDate: true, endDate: true },
    });
    if (overlap) {
      throw new ConflictException({ code: 'LEAVE_OVERLAP', message: 'Энэ ажилтны өөр чөлөөтэй огтлолцож байна' });
    }

    return this.prisma.$transaction(async (tx) => {
      const rec = await tx.leaveRequest.create({
        data: {
          companyId: user.companyId,
          employeeId: input.employeeId,
          type: input.type,
          startDate: startD,
          endDate: endD,
          days,
          reason: input.reason ?? null,
          requestedById: user.employeeId,
        },
        include: { employee: { select: empSelect } },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.LEAVE_REQUEST, entity: 'LeaveRequest', entityId: rec.id, after: rec, ip },
        tx,
      );
      return rec;
    });
  }

  private async loadOwn(tx: Prisma.TransactionClient, companyId: string, id: string) {
    const rec = await tx.leaveRequest.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!rec) throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: 'Чөлөөний хүсэлт олдсонгүй' });
    return rec;
  }

  // ── Батлах ──
  async approve(user: AuthUser, id: string, ip: string | null) {
    this.assertCanDecide(user);
    return this.prisma.$transaction(async (tx) => {
      const rec = await this.loadOwn(tx, user.companyId, id);
      if (rec.status !== 'PENDING') throw new ConflictException({ code: 'NOT_PENDING', message: 'Хүлээгдэж буй хүсэлт биш байна' });
      this.assertNotSelf(user, rec.requestedById);
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: 'APPROVED', decidedById: user.employeeId, decidedAt: new Date() },
        include: { employee: { select: empSelect } },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.LEAVE_APPROVE, entity: 'LeaveRequest', entityId: id, before: rec, after: updated, ip },
        tx,
      );
      return updated;
    });
  }

  // ── Татгалзах ──
  async reject(user: AuthUser, id: string, input: LeaveRejectInput, ip: string | null) {
    this.assertCanDecide(user);
    return this.prisma.$transaction(async (tx) => {
      const rec = await this.loadOwn(tx, user.companyId, id);
      if (rec.status !== 'PENDING') throw new ConflictException({ code: 'NOT_PENDING', message: 'Хүлээгдэж буй хүсэлт биш байна' });
      this.assertNotSelf(user, rec.requestedById);
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedById: user.employeeId, decidedAt: new Date(), decisionNote: input.note ?? null },
        include: { employee: { select: empSelect } },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.LEAVE_REJECT, entity: 'LeaveRequest', entityId: id, before: rec, after: updated, ip },
        tx,
      );
      return updated;
    });
  }

  // ── Цуцлах (хүсэгч өөрөө эсвэл менежер) ──
  async cancel(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const rec = await this.loadOwn(tx, user.companyId, id);
      if (rec.status !== 'PENDING' && rec.status !== 'APPROVED') {
        throw new ConflictException({ code: 'NOT_CANCELLABLE', message: 'Энэ төлөвт цуцлах боломжгүй' });
      }
      const isOwner = rec.requestedById === user.employeeId;
      const canManage = user.roles.some(
        (r) => r === RoleKey.STATION_MANAGER || r === RoleKey.ACCOUNTANT || r === RoleKey.ADMIN || r === RoleKey.OWNER,
      );
      if (!isOwner && !canManage) {
        throw new ForbiddenException({ code: 'FORBIDDEN_CANCEL', message: 'Энэ хүсэлтийг цуцлах эрхгүй байна' });
      }
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: 'CANCELLED', decidedById: user.employeeId, decidedAt: new Date() },
        include: { employee: { select: empSelect } },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.LEAVE_CANCEL, entity: 'LeaveRequest', entityId: id, before: rec, after: updated, ip },
        tx,
      );
      return updated;
    });
  }

  // ── Жагсаалт (шүүлттэй) ──
  async list(user: AuthUser, q: LeaveQuery) {
    const where: Prisma.LeaveRequestWhereInput = { companyId: user.companyId, deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.from || q.to) {
      // [from,to] мужтай огтлолцсон чөлөөнүүд
      if (q.to) where.startDate = { lte: ymdToDate(q.to) };
      if (q.from) where.endDate = { gte: ymdToDate(q.from) };
    }
    const rows = await this.prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: empSelect } },
      orderBy: [{ startDate: 'desc' }],
      take: 500,
    });
    return { rows };
  }

  // ── Жилийн ээлжийн амралтын үлдэгдэл (ажилтан бүрээр) ──
  async balances(user: AuthUser, year: number) {
    const start = ymdToDate(`${year}-01-01`);
    const end = ymdToDate(`${year}-12-31`);
    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'ACTIVE' },
      select: { ...empSelect, annualLeaveDays: true },
      orderBy: [{ firstName: 'asc' }],
    });
    // Тухайн жилийн зөвшөөрсөн ЭЭЛЖИЙН амралтын хоног (эхлэх огноогоор)
    const used = await this.prisma.leaveRequest.groupBy({
      by: ['employeeId'],
      where: { companyId: user.companyId, deletedAt: null, status: 'APPROVED', type: 'ANNUAL', startDate: { gte: start, lte: end } },
      _sum: { days: true },
    });
    const usedById = new Map(used.map((u) => [u.employeeId, u._sum.days ?? 0]));
    const rows = employees.map((e) => {
      const entitlement = e.annualLeaveDays || DEFAULT_ANNUAL_LEAVE_DAYS;
      const usedDays = usedById.get(e.id) ?? 0;
      return {
        employeeId: e.id,
        name: `${e.lastName} ${e.firstName}`.trim(),
        employeeCode: e.employeeCode,
        entitlement,
        used: usedDays,
        remaining: entitlement - usedDays,
      };
    });
    return { year, rows };
  }

  // ── Тухайн өдөр чөлөөтэй (зөвшөөрсөн) ажилтнууд ──
  async onLeave(user: AuthUser, dateYmd: string) {
    const d = ymdToDate(dateYmd);
    const rows = await this.prisma.leaveRequest.findMany({
      where: { companyId: user.companyId, deletedAt: null, status: 'APPROVED', startDate: { lte: d }, endDate: { gte: d } },
      include: { employee: { select: empSelect } },
      orderBy: [{ startDate: 'asc' }],
    });
    return { date: dateYmd, rows };
  }
}
