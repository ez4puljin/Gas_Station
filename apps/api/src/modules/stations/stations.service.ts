import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateFuelTankInput,
  CreateStationInput,
  UpdateFuelTankInput,
  UpdateStationInput,
} from '@fuel/schemas';
import { AuditAction, type AuthUser } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';

const tankInclude = {
  fuelGrade: { select: { id: true, code: true, name: true } },
} satisfies Prisma.FuelTankInclude;
const toDec = (v: number | string) => new Prisma.Decimal(String(v));

/**
 * Салбарын үйлчилгээ — CLAUDE.md §10 (бүх query stationId/company-аар scope).
 * Хэрэглэгч зөвхөн эрхтэй салбараа хардаг; owner/admin бүгдийг.
 */
@Injectable()
export class StationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.station.findMany({
      where: {
        deletedAt: null,
        companyId: user.companyId,
        ...(user.allStations ? {} : { id: { in: user.stationIds } }),
      },
      orderBy: { code: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    if (!user.allStations && !user.stationIds.includes(id)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_STATION',
        message: 'Энэ салбарт хандах эрхгүй байна',
      });
    }
    const station = await this.prisma.station.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!station) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Салбар олдсонгүй' });
    }
    return station;
  }

  /** Шинэ салбар үүсгэх (зөвхөн owner/admin — controller-ийн @Roles). Audit-тай. */
  async create(user: AuthUser, input: CreateStationInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const station = await tx.station.create({
        data: {
          // §2.2/§10 — company-г ХЭЗЭЭ Ч client-ээс биш, token-оос авна (cross-tenant write-аас сэргийлнэ)
          companyId: user.companyId,
          code: input.code,
          name: input.name,
          address: input.address,
          timezone: input.timezone,
        },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.CREATE,
          entity: 'Station',
          entityId: station.id,
          after: station,
          stationId: station.id,
          ip,
        },
        tx,
      );
      return station;
    });
  }

  /** Салбар засах (owner/admin). Audit-тай. */
  async update(user: AuthUser, id: string, input: UpdateStationInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.station.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
      });
      if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Салбар олдсонгүй' });
      const station = await tx.station.update({
        where: { id },
        data: {
          code: input.code ?? undefined,
          name: input.name ?? undefined,
          address: input.address ?? undefined,
          timezone: input.timezone ?? undefined,
          isActive: input.isActive ?? undefined,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.UPDATE, entity: 'Station', entityId: id, before, after: station, stationId: id, ip },
        tx,
      );
      return station;
    });
  }

  /** Салбар soft-delete (owner/admin) — §2.6. */
  async softDelete(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.station.findFirst({
        where: { id, companyId: user.companyId, deletedAt: null },
      });
      if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Салбар олдсонгүй' });
      const openShift = await tx.shift.findFirst({ where: { stationId: id, status: 'OPEN' } });
      if (openShift) {
        throw new ForbiddenException({
          code: 'STATION_HAS_OPEN_SHIFT',
          message: 'Нээлттэй ээлжтэй салбарыг устгах боломжгүй',
        });
      }
      await tx.station.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SOFT_DELETE, entity: 'Station', entityId: id, before, stationId: id, ip },
        tx,
      );
      return { id, deleted: true };
    });
  }

  // ── Резервуар (FuelTank) — салбар доторх (§7.2) ──
  /** Бүх идэвхтэй түлшний грейд (сав үүсгэхэд) */
  listFuelGrades() {
    return this.prisma.fuelGrade.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  async listTanks(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    return this.prisma.fuelTank.findMany({
      where: { stationId, deletedAt: null },
      include: tankInclude,
      orderBy: { code: 'asc' },
    });
  }

  async createTank(user: AuthUser, stationId: string, input: CreateFuelTankInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await assertStationAccess(tx, user, stationId);
      const grade = await tx.fuelGrade.findFirst({ where: { id: input.fuelGradeId, isActive: true }, select: { id: true } });
      if (!grade) throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Түлшний грейд олдсонгүй' });
      const dup = await tx.fuelTank.findFirst({ where: { stationId, code: input.code, deletedAt: null }, select: { id: true } });
      if (dup) throw new ConflictException({ code: 'TANK_CODE_TAKEN', message: 'Савны код давхцаж байна' });
      const tank = await tx.fuelTank.create({
        data: {
          stationId,
          fuelGradeId: input.fuelGradeId,
          code: input.code,
          capacityLiters: toDec(input.capacityLiters),
          currentLiters: toDec(input.currentLiters ?? 0),
          minLiters: toDec(input.minLiters ?? 0),
        },
        include: tankInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.CREATE, entity: 'FuelTank', entityId: tank.id, after: tank, stationId, ip },
        tx,
      );
      return tank;
    });
  }

  async updateTank(user: AuthUser, stationId: string, tankId: string, input: UpdateFuelTankInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await assertStationAccess(tx, user, stationId);
      const before = await tx.fuelTank.findFirst({ where: { id: tankId, stationId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });
      if (input.fuelGradeId) {
        const grade = await tx.fuelGrade.findFirst({ where: { id: input.fuelGradeId, isActive: true }, select: { id: true } });
        if (!grade) throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Түлшний грейд олдсонгүй' });
      }
      // Код солих үед давхцлыг тодорхой алдаагаар (createTank-тай нийцтэй)
      if (input.code && input.code !== before.code) {
        const dup = await tx.fuelTank.findFirst({
          where: { stationId, code: input.code, deletedAt: null, id: { not: tankId } },
          select: { id: true },
        });
        if (dup) throw new ConflictException({ code: 'TANK_CODE_TAKEN', message: 'Савны код давхцаж байна' });
      }
      const tank = await tx.fuelTank.update({
        where: { id: tankId },
        data: {
          code: input.code ?? undefined,
          fuelGradeId: input.fuelGradeId ?? undefined,
          capacityLiters: input.capacityLiters !== undefined ? toDec(input.capacityLiters) : undefined,
          minLiters: input.minLiters !== undefined ? toDec(input.minLiters) : undefined,
          isActive: input.isActive ?? undefined,
        },
        include: tankInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.UPDATE, entity: 'FuelTank', entityId: tankId, before, after: tank, stationId, ip },
        tx,
      );
      return tank;
    });
  }

  async deleteTank(user: AuthUser, stationId: string, tankId: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await assertStationAccess(tx, user, stationId);
      const before = await tx.fuelTank.findFirst({ where: { id: tankId, stationId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });
      await tx.fuelTank.update({ where: { id: tankId }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SOFT_DELETE, entity: 'FuelTank', entityId: tankId, before, stationId, ip },
        tx,
      );
      return { id: tankId, deleted: true };
    });
  }
}
