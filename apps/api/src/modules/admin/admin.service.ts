import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type {
  CreateEmployeeInput,
  CreateUserInput,
  ResetPasswordInput,
  SetEmployeeRolesInput,
  SetEmployeeStationsInput,
  SetRolePermissionsInput,
  UpdateEmployeeInput,
} from '@fuel/schemas';
import { AuditAction, type AuthUser } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';

const employeeInclude = {
  roles: { include: { role: true } },
  stations: { include: { station: { select: { id: true, code: true, name: true } } } },
  user: { select: { id: true, username: true, isActive: true } },
} satisfies Prisma.EmployeeInclude;

/** Admin panel — ажилтан/хэрэглэгч/role удирдлага. OWNER/ADMIN (controller @Roles). */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  // ── Ажилтан ──────────────────────────────────────────
  listEmployees(user: AuthUser) {
    return this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: employeeInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private async assertStations(tx: Prisma.TransactionClient, companyId: string, stationIds: string[]) {
    const unique = [...new Set(stationIds)];
    if (unique.length === 0) return;
    const cnt = await tx.station.count({
      where: { id: { in: unique }, companyId, deletedAt: null },
    });
    if (cnt !== unique.length) {
      throw new BadRequestException({ code: 'INVALID_STATION', message: 'Буруу салбар сонгосон' });
    }
  }

  private async resolveRoles(tx: Prisma.TransactionClient, roleKeys: string[]) {
    const unique = [...new Set(roleKeys)];
    if (unique.length === 0) return [];
    const roles = await tx.role.findMany({ where: { key: { in: unique } } });
    if (roles.length !== unique.length) {
      throw new BadRequestException({ code: 'INVALID_ROLE', message: 'Буруу role сонгосон' });
    }
    return roles;
  }

  async createEmployee(user: AuthUser, input: CreateEmployeeInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      // Давхардсан салбарыг цэвэрлэнэ (P2002-оос сэргийлнэ — @@unique combos)
      const stationIds = [...new Set(input.stationIds)];
      await this.assertStations(tx, user.companyId, stationIds);
      const roles = await this.resolveRoles(tx, input.roleKeys);

      const employee = await tx.employee.create({
        data: {
          companyId: user.companyId,
          firstName: input.firstName,
          lastName: input.lastName,
          employeeCode: input.employeeCode ?? null,
          phone: input.phone,
          address: input.address,
          email: input.email ?? null,
          status: input.isActive === false ? 'INACTIVE' : 'ACTIVE',
          stations: { create: stationIds.map((stationId) => ({ stationId })) },
          // Тухайн салбар(ууд)-ын эрх — role × station (§ "тухайн салбарын эрх")
          roles: {
            create: roles.flatMap((r) => stationIds.map((stationId) => ({ roleId: r.id, stationId }))),
          },
        },
      });

      // Нэвтрэх данс (хоёулаа өгсөн үед)
      if (input.username && input.password) {
        const existing = await tx.user.findUnique({ where: { username: input.username } });
        if (existing) {
          throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'Нэвтрэх нэр давхцаж байна' });
        }
        const passwordHash = await argon2.hash(input.password);
        await tx.user.create({
          data: { employeeId: employee.id, username: input.username, passwordHash },
        });
      }

      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.EMPLOYEE_CHANGE,
          entity: 'Employee',
          entityId: employee.id,
          after: employee,
          ip,
        },
        tx,
      );
      return tx.employee.findUnique({ where: { id: employee.id }, include: employeeInclude });
    });
  }

  async updateEmployee(user: AuthUser, id: string, input: UpdateEmployeeInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
      const employee = await tx.employee.update({
        where: { id },
        data: {
          firstName: input.firstName ?? undefined,
          lastName: input.lastName ?? undefined,
          employeeCode: input.employeeCode ?? undefined,
          phone: input.phone ?? undefined,
          address: input.address ?? undefined,
          email: input.email ?? undefined,
          status: input.status ?? undefined,
        },
        include: employeeInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.EMPLOYEE_CHANGE, entity: 'Employee', entityId: id, before, after: employee, ip },
        tx,
      );
      return employee;
    });
  }

  async softDeleteEmployee(user: AuthUser, id: string, ip: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
      if (before.id === user.employeeId) {
        throw new BadRequestException({ code: 'CANNOT_DELETE_SELF', message: 'Өөрийгөө устгах боломжгүй' });
      }
      const account = await tx.user.findFirst({ where: { employeeId: id }, select: { id: true } });
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
      // Нэвтрэх дансыг идэвхгүй болгоно (login хаагдана)
      await tx.user.updateMany({ where: { employeeId: id }, data: { isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.EMPLOYEE_CHANGE, entity: 'Employee', entityId: id, before, after: { deletedAt: new Date() }, ip },
        tx,
      );
      return { id, deleted: true, userId: account?.id ?? null };
    });
    // Идэвхтэй сессийг (refresh token) цуцлах — устгасан ажилтан токеноор нэвтрэхгүй (best-effort).
    if (result.userId) await this.tokens.revokeAll(result.userId).catch(() => undefined);
    return { id: result.id, deleted: result.deleted };
  }

  // ── Role / салбар оноох ──────────────────────────────
  async setEmployeeRoles(user: AuthUser, id: string, input: SetEmployeeRolesInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
        include: { stations: true },
      });
      if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
      const roles = await this.resolveRoles(tx, input.roleKeys);
      // Эрхийг ажилтны салбар(ууд)-д оноох (create-тэй нийцтэй); салбаргүй бол company-түвшинд.
      const stationIds = employee.stations.map((s) => s.stationId);
      const data =
        stationIds.length > 0
          ? roles.flatMap((r) => stationIds.map((stationId) => ({ employeeId: id, roleId: r.id, stationId })))
          : roles.map((r) => ({ employeeId: id, roleId: r.id, stationId: null }));
      await tx.employeeRole.deleteMany({ where: { employeeId: id } });
      await tx.employeeRole.createMany({ data });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.PERMISSION_CHANGE, entity: 'Employee', entityId: id, after: { roleKeys: input.roleKeys }, ip },
        tx,
      );
      return tx.employee.findUnique({ where: { id }, include: employeeInclude });
    });
  }

  async setEmployeeStations(user: AuthUser, id: string, input: SetEmployeeStationsInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
      await this.assertStations(tx, user.companyId, input.stationIds);
      await tx.employeeStation.deleteMany({ where: { employeeId: id } });
      await tx.employeeStation.createMany({
        data: input.stationIds.map((stationId) => ({ employeeId: id, stationId })),
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.EMPLOYEE_CHANGE, entity: 'Employee', entityId: id, after: { stationIds: input.stationIds }, ip },
        tx,
      );
      return tx.employee.findUnique({ where: { id }, include: employeeInclude });
    });
  }

  // ── Нэвтрэх данс ─────────────────────────────────────
  async createUserForEmployee(user: AuthUser, employeeId: string, input: CreateUserInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, companyId: user.companyId, deletedAt: null },
        include: { user: true },
      });
      if (!employee) throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Ажилтан олдсонгүй' });
      if (employee.user) {
        throw new ConflictException({ code: 'USER_EXISTS', message: 'Энэ ажилтан нэвтрэх данстай байна' });
      }
      const taken = await tx.user.findUnique({ where: { username: input.username } });
      if (taken) throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'Нэвтрэх нэр давхцаж байна' });
      const passwordHash = await argon2.hash(input.password);
      const created = await tx.user.create({
        data: { employeeId, username: input.username, passwordHash },
        select: { id: true, username: true, isActive: true },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.EMPLOYEE_CHANGE, entity: 'User', entityId: created.id, after: { username: created.username }, ip },
        tx,
      );
      return created;
    });
  }

  async resetPassword(user: AuthUser, employeeId: string, input: ResetPasswordInput, ip: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, companyId: user.companyId, deletedAt: null },
        include: { user: true },
      });
      if (!employee?.user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Нэвтрэх данс олдсонгүй' });
      const passwordHash = await argon2.hash(input.password);
      await tx.user.update({ where: { id: employee.user.id }, data: { passwordHash } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.EMPLOYEE_CHANGE, entity: 'User', entityId: employee.user.id, after: { passwordReset: true }, ip },
        tx,
      );
      return { userId: employee.user.id, reset: true };
    });
    // Нууц үг солигдсон тул бүх идэвхтэй сесс (refresh token)-ийг цуцлана —
    // хулгайлагдсан токен reset-ийн дараа ажиллахгүй (best-effort, Redis алдаа commit-ийг буцаахгүй).
    await this.tokens.revokeAll(result.userId).catch(() => undefined);
    return result;
  }

  // ── Role / Permission ────────────────────────────────
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { key: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isSystem: r.isSystem,
      permissionKeys: r.permissions.map((p) => p.permission.key),
    }));
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  async setRolePermissions(user: AuthUser, roleKey: string, input: SetRolePermissionsInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { key: roleKey } });
      if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role олдсонгүй' });
      const perms = await tx.permission.findMany({ where: { key: { in: input.permissionKeys } } });
      if (perms.length !== new Set(input.permissionKeys).size) {
        throw new BadRequestException({ code: 'INVALID_PERMISSION', message: 'Буруу permission' });
      }
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.PERMISSION_CHANGE, entity: 'Role', entityId: role.id, after: { roleKey, permissionKeys: input.permissionKeys }, ip },
        tx,
      );
      return { roleKey, permissionKeys: input.permissionKeys };
    });
  }
}
