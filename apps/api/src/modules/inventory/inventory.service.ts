import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreateProductGroupInput,
  type CreateProductInput,
  type CreateSupplierInput,
  type DeliveryReportQuery,
  divRoundHalfUp,
  type FuelDeliveryInput,
  type FuelReconQuery,
  lineTotalMnt,
  milliToDecimalString,
  type MovementReportQuery,
  type SetReorderLevelInput,
  type StockAdjustmentInput,
  type StockTransferInput,
  type TankReadingInput,
  toMilliUnits,
  type UpdateProductGroupInput,
  type UpdateProductInput,
} from '@fuel/schemas';
import {
  AuditAction,
  type AuthUser,
  FuelDeliveryStatus,
  StockMovementType,
} from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';
import { RealtimeEvent, RealtimeGateway } from '../realtime/realtime.gateway';

const dec = (milli: bigint) => new Prisma.Decimal(milliToDecimalString(milli));

/** Нөөц / Агуулах — CLAUDE.md §7.2. Бүх хөдөлгөөн StockMovement ledger-т (§2.3, §2.7, §8). */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Нөөц өөрчлөгдсөн эвент — самбар/alert шинэчлэхэд (§4) */
  private notifyInventory(companyId: string, stationId: string): void {
    this.realtime.emitToStation(companyId, stationId, RealtimeEvent.INVENTORY_CHANGED, {
      stationId,
    });
  }

  // ── Бараа ──────────────────────────────────────────────
  private readonly productInclude = {
    group: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
  } satisfies Prisma.ProductInclude;

  listProducts(user: AuthUser) {
    return this.prisma.product.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: this.productInclude,
      orderBy: [{ group: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
  }

  /** groupId/supplierId өгсөн бол компанид харьяалагдахыг шалгана (§10). */
  private async assertRefs(
    tx: Prisma.TransactionClient,
    companyId: string,
    groupId?: string | null,
    supplierId?: string | null,
  ) {
    if (groupId) {
      const g = await tx.productGroup.findFirst({ where: { id: groupId, companyId, deletedAt: null }, select: { id: true } });
      if (!g) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Барааны бүлэг олдсонгүй' });
    }
    if (supplierId) {
      const s = await tx.supplier.findFirst({ where: { id: supplierId, companyId, deletedAt: null }, select: { id: true } });
      if (!s) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });
    }
  }

  async createProduct(user: AuthUser, input: CreateProductInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertRefs(tx, user.companyId, input.groupId, input.supplierId);
      const product = await tx.product.create({
        data: {
          companyId: user.companyId,
          groupId: input.groupId ?? null,
          supplierId: input.supplierId ?? null,
          sku: input.sku,
          name: input.name,
          category: input.category ?? null,
          unit: input.unit,
          barcode: input.barcode ?? null,
          imageUrl: input.imageUrl || null,
          priceMnt: input.priceMnt,
          costMnt: input.costMnt ?? null,
          isVatable: input.isVatable,
          isActive: input.isActive,
        },
        include: this.productInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.CREATE, entity: 'Product', entityId: product.id, after: product, ip },
        tx,
      );
      return product;
    });
  }

  async updateProduct(user: AuthUser, id: string, input: UpdateProductInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
      await this.assertRefs(tx, user.companyId, input.groupId ?? undefined, input.supplierId ?? undefined);
      const product = await tx.product.update({
        where: { id },
        data: {
          sku: input.sku ?? undefined,
          name: input.name ?? undefined,
          groupId: input.groupId === undefined ? undefined : input.groupId,
          supplierId: input.supplierId === undefined ? undefined : input.supplierId,
          category: input.category === undefined ? undefined : input.category,
          unit: input.unit ?? undefined,
          barcode: input.barcode === undefined ? undefined : input.barcode,
          imageUrl: input.imageUrl === undefined ? undefined : input.imageUrl || null,
          priceMnt: input.priceMnt ?? undefined,
          costMnt: input.costMnt === undefined ? undefined : input.costMnt,
          isVatable: input.isVatable ?? undefined,
          isActive: input.isActive ?? undefined,
        },
        include: this.productInclude,
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.UPDATE, entity: 'Product', entityId: id, before, after: product, ip },
        tx,
      );
      return product;
    });
  }

  async deleteProduct(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
      const product = await tx.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SOFT_DELETE, entity: 'Product', entityId: id, before, after: product, ip },
        tx,
      );
      return { id, deleted: true };
    });
  }

  // ── Барааны бүлэг (ProductGroup) ───────────────────────
  listProductGroups(user: AuthUser) {
    return this.prisma.productGroup.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createProductGroup(user: AuthUser, input: CreateProductGroupInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.create({
        data: {
          companyId: user.companyId,
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.CREATE, entity: 'ProductGroup', entityId: group.id, after: group, ip },
        tx,
      );
      return group;
    });
  }

  async updateProductGroup(user: AuthUser, id: string, input: UpdateProductGroupInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.productGroup.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Барааны бүлэг олдсонгүй' });
      const group = await tx.productGroup.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          sortOrder: input.sortOrder ?? undefined,
          isActive: input.isActive ?? undefined,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.UPDATE, entity: 'ProductGroup', entityId: id, before, after: group, ip },
        tx,
      );
      return group;
    });
  }

  async deleteProductGroup(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.productGroup.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: 'Барааны бүлэг олдсонгүй' });
      // Бүлэгт хамаарах барааны холбоосыг салгана (бараа устахгүй)
      await tx.product.updateMany({ where: { groupId: id }, data: { groupId: null } });
      const group = await tx.productGroup.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SOFT_DELETE, entity: 'ProductGroup', entityId: id, before, after: group, ip },
        tx,
      );
      return { id, deleted: true };
    });
  }

  // ── Нийлүүлэгч ─────────────────────────────────────────
  listSuppliers(user: AuthUser) {
    return this.prisma.supplier.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(user: AuthUser, input: CreateSupplierInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          companyId: user.companyId,
          name: input.name,
          contact: input.contact ?? null,
          phone: input.phone ?? null,
          regNo: input.regNo ?? null,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.CREATE, entity: 'Supplier', entityId: supplier.id, after: supplier, ip },
        tx,
      );
      return supplier;
    });
  }

  // ── Нөөцийн төлөв ──────────────────────────────────────
  async stockOverview(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const [levels, tanks] = await Promise.all([
      this.prisma.stockLevel.findMany({
        where: { stationId },
        include: { product: true },
        orderBy: { product: { name: 'asc' } },
      }),
      this.prisma.fuelTank.findMany({
        where: { stationId, deletedAt: null },
        include: { fuelGrade: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return {
      products: levels.map((l) => ({
        productId: l.productId,
        name: l.product.name,
        sku: l.product.sku,
        unit: l.product.unit,
        quantity: l.quantity,
        reorderLevel: l.reorderLevel,
      })),
      tanks: tanks.map((t) => ({
        tankId: t.id,
        code: t.code,
        grade: t.fuelGrade.code,
        capacityLiters: t.capacityLiters,
        currentLiters: t.currentLiters,
        minLiters: t.minLiters,
      })),
    };
  }

  // ── Нөөцийн засвар (§2.7 reason + actor) ───────────────
  async adjustStock(user: AuthUser, input: StockAdjustmentInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    const deltaMilli = toMilliUnits(input.quantityDelta);
    if (deltaMilli === 0n) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Засварын хэмжээ 0 байж болохгүй' });
    }
    const deltaDec = dec(deltaMilli);

    const result = await this.prisma.$transaction(async (tx) => {
      let entity: string;
      let movement;

      if (input.productId) {
        const product = await tx.product.findFirst({
          where: { id: input.productId, companyId: user.companyId, deletedAt: null },
        });
        if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
        await tx.stockLevel.upsert({
          where: { stationId_productId: { stationId: input.stationId, productId: input.productId } },
          update: { quantity: { increment: deltaDec } },
          create: { stationId: input.stationId, productId: input.productId, quantity: deltaDec },
        });
        // Тэмдэглэл (§1): борлуулалт/засвараар нөөц сөрөг болж болно — POS-ийг зогсоохгүй,
        // зөрүүг тооцоо нийлэх + alert-аар илрүүлж, audit-д бүрэн тэмдэглэнэ.
        movement = await tx.stockMovement.create({
          data: {
            stationId: input.stationId,
            type: StockMovementType.ADJUSTMENT,
            productId: input.productId,
            quantity: deltaDec,
            unitCostMnt: input.unitCostMnt ?? null,
            reason: input.reason,
            actorId: user.sub,
            refType: 'adjustment',
          },
        });
        entity = 'StockMovement';
      } else {
        const tank = await tx.fuelTank.findFirst({
          where: { id: input.fuelTankId, stationId: input.stationId, deletedAt: null },
        });
        if (!tank) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });
        await tx.fuelTank.update({
          where: { id: tank.id },
          data: { currentLiters: { increment: deltaDec } },
        });
        movement = await tx.stockMovement.create({
          data: {
            stationId: input.stationId,
            type: StockMovementType.ADJUSTMENT,
            fuelTankId: tank.id,
            quantity: deltaDec,
            unitCostMnt: input.unitCostMnt ?? null,
            reason: input.reason,
            actorId: user.sub,
            refType: 'adjustment',
          },
        });
        entity = 'StockMovement';
      }

      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.STOCK_ADJUST,
          entity,
          entityId: movement.id,
          after: movement,
          stationId: input.stationId,
          ip,
        },
        tx,
      );
      return movement;
    });
    this.notifyInventory(user.companyId, input.stationId);
    return result;
  }

  // ── Түлшний нийлүүлэлт хүлээн авах ─────────────────────
  async receiveDelivery(user: AuthUser, input: FuelDeliveryInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    const litersMilli = toMilliUnits(input.liters);
    if (litersMilli <= 0n) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Литр 0-ээс их байх ёстой' });
    }
    const litersDec = dec(litersMilli);
    const totalCostMnt = lineTotalMnt(input.unitCostMnt, litersMilli);

    const result = await this.prisma.$transaction(async (tx) => {
      const tank = await tx.fuelTank.findFirst({
        where: { id: input.tankId, stationId: input.stationId, deletedAt: null },
      });
      if (!tank) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });

      if (input.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: input.supplierId, companyId: user.companyId, deletedAt: null },
        });
        if (!supplier) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });
      }

      const delivery = await tx.fuelDelivery.create({
        data: {
          stationId: input.stationId,
          supplierId: input.supplierId ?? null,
          fuelGradeId: tank.fuelGradeId,
          tankId: tank.id,
          status: FuelDeliveryStatus.RECEIVED,
          liters: litersDec,
          unitCostMnt: input.unitCostMnt,
          totalCostMnt,
          documentNo: input.documentNo ?? null,
          receivedById: user.employeeId,
          receivedAt: new Date(),
        },
      });
      await tx.fuelTank.update({
        where: { id: tank.id },
        data: { currentLiters: { increment: litersDec } },
      });
      await tx.stockMovement.create({
        data: {
          stationId: input.stationId,
          type: StockMovementType.RECEIPT,
          fuelTankId: tank.id,
          quantity: litersDec,
          unitCostMnt: input.unitCostMnt,
          refType: 'delivery',
          refId: delivery.id,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.FUEL_DELIVERY,
          entity: 'FuelDelivery',
          entityId: delivery.id,
          after: delivery,
          stationId: input.stationId,
          ip,
        },
        tx,
      );
      return delivery;
    });
    this.notifyInventory(user.companyId, input.stationId);
    return result;
  }

  // ── Резервуарын түвшин (тооцоо нийлэх) ─────────────────
  async recordTankReading(user: AuthUser, input: TankReadingInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    const levelDec = dec(toMilliUnits(input.levelLiters));

    // Унших + бичих + variance-ийг нэг snapshot-д (TOCTOU-аас сэргийлнэ) + audit (§8)
    return this.prisma.$transaction(async (tx) => {
      const tank = await tx.fuelTank.findFirst({
        where: { id: input.tankId, stationId: input.stationId, deletedAt: null },
      });
      if (!tank) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });

      const reading = await tx.tankReading.create({
        data: {
          tankId: tank.id,
          stationId: input.stationId,
          levelLiters: levelDec,
          temperatureC:
            input.temperatureC != null ? new Prisma.Decimal(String(input.temperatureC)) : null,
          source: input.source,
        },
      });

      // Тооцоо нийлэх: бодит (reading) − дэвтэр (currentLiters)
      const varianceLiters = levelDec.minus(tank.currentLiters);

      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.TANK_READING,
          entity: 'TankReading',
          entityId: reading.id,
          after: { reading, bookLiters: tank.currentLiters, varianceLiters },
          stationId: input.stationId,
          ip,
        },
        tx,
      );

      return { reading, bookLiters: tank.currentLiters, varianceLiters };
    });
  }

  // ── Дахин захиалах түвшин тохируулах (бараа alert идэвхжүүлэх) ─────
  async setReorderLevel(user: AuthUser, input: SetReorderLevelInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    const levelDec = dec(toMilliUnits(input.reorderLevel));
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, companyId: user.companyId, deletedAt: null },
      });
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
      const level = await tx.stockLevel.upsert({
        where: { stationId_productId: { stationId: input.stationId, productId: input.productId } },
        update: { reorderLevel: levelDec },
        create: { stationId: input.stationId, productId: input.productId, reorderLevel: levelDec },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.UPDATE,
          entity: 'StockLevel',
          entityId: level.id,
          after: level,
          stationId: input.stationId,
          ip,
        },
        tx,
      );
      return level;
    });
  }

  // ── Салбар хооронд шилжүүлэг (2 талын ledger) ──────────
  async transferStock(user: AuthUser, input: StockTransferInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.fromStationId);
    await assertStationAccess(this.prisma, user, input.toStationId);
    const qtyMilli = toMilliUnits(input.quantity);
    if (qtyMilli <= 0n) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Тоо хэмжээ 0-ээс их байх ёстой' });
    }
    const qtyDec = dec(qtyMilli);
    const negDec = dec(-qtyMilli);

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, companyId: user.companyId, deletedAt: null },
      });
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });

      // Эх салбарт хүрэлцэхүйц нөөц байх ёстой — байхгүй нөөцийг шилжүүлэхгүй (sufficiency).
      // (Шилжүүлэг нь зориудын үйлдэл тул POS-аас ялгаатайгаар хатуу шалгана.)
      const source = await tx.stockLevel.findUnique({
        where: { stationId_productId: { stationId: input.fromStationId, productId: input.productId } },
      });
      if (!source || source.quantity.lt(qtyDec)) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          message: 'Эх салбарт хүрэлцэхүйц нөөц алга',
        });
      }
      await tx.stockLevel.update({
        where: { stationId_productId: { stationId: input.fromStationId, productId: input.productId } },
        data: { quantity: { decrement: qtyDec } },
      });
      await tx.stockLevel.upsert({
        where: { stationId_productId: { stationId: input.toStationId, productId: input.productId } },
        update: { quantity: { increment: qtyDec } },
        create: { stationId: input.toStationId, productId: input.productId, quantity: qtyDec },
      });

      const outMv = await tx.stockMovement.create({
        data: {
          stationId: input.fromStationId,
          type: StockMovementType.TRANSFER,
          productId: input.productId,
          quantity: negDec,
          reason: input.reason,
          transferStationId: input.toStationId,
          refType: 'transfer',
          actorId: user.sub,
        },
      });
      const inMv = await tx.stockMovement.create({
        data: {
          stationId: input.toStationId,
          type: StockMovementType.TRANSFER,
          productId: input.productId,
          quantity: qtyDec,
          reason: input.reason,
          transferStationId: input.fromStationId,
          refType: 'transfer',
          refId: outMv.id,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.STOCK_TRANSFER,
          entity: 'StockMovement',
          entityId: outMv.id,
          after: { out: outMv, in: inMv },
          stationId: input.fromStationId,
          ip,
        },
        tx,
      );
      return { out: outMv, in: inMv };
    });
    this.notifyInventory(user.companyId, input.fromStationId);
    this.notifyInventory(user.companyId, input.toStationId);
    return result;
  }

  // ── Нөөц бага alert ────────────────────────────────────
  async lowStockAlerts(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const [levels, tanks] = await Promise.all([
      this.prisma.stockLevel.findMany({
        where: { stationId, reorderLevel: { gt: 0 } },
        include: { product: true },
      }),
      this.prisma.fuelTank.findMany({ where: { stationId, deletedAt: null }, include: { fuelGrade: true } }),
    ]);
    return {
      products: levels
        .filter((l) => l.quantity.lte(l.reorderLevel))
        .map((l) => ({ productId: l.productId, name: l.product.name, quantity: l.quantity, reorderLevel: l.reorderLevel })),
      tanks: tanks
        .filter((t) => t.currentLiters.lte(t.minLiters))
        .map((t) => ({ tankId: t.id, code: t.code, grade: t.fuelGrade.code, currentLiters: t.currentLiters, minLiters: t.minLiters })),
    };
  }

  // ── StockMovement ledger ───────────────────────────────
  async listMovements(user: AuthUser, stationId: string, page: number, pageSize: number) {
    await assertStationAccess(this.prisma, user, stationId);
    const where: Prisma.StockMovementWhereInput = { stationId };
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  // ── Тайлангууд (муж + экспорт) ─────────────────────────
  private async accessibleStationIds(user: AuthUser): Promise<string[]> {
    const stations = await this.prisma.station.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(user.allStations ? {} : { id: { in: user.stationIds } }) },
      select: { id: true },
    });
    return stations.map((s) => s.id);
  }

  private ubRange(from: string, to: string) {
    const start = new Date(`${from}T00:00:00+08:00`);
    const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    return { start, end };
  }

  /** Түлшний нийлүүлэлт / нийлүүлэгчийн тайлан — муж + нийлүүлэгч/грейд. */
  async deliveriesReport(user: AuthUser, q: DeliveryReportQuery) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }
    const { start, end } = this.ubRange(q.from, q.to);
    const where: Prisma.FuelDeliveryWhereInput = {
      stationId: { in: stationIds },
      deletedAt: null,
      status: FuelDeliveryStatus.RECEIVED,
      receivedAt: { gte: start, lt: end },
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.fuelGradeId ? { fuelGradeId: q.fuelGradeId } : {}),
    };
    const rows = await this.prisma.fuelDelivery.findMany({
      where,
      include: { supplier: { select: { name: true } }, fuelGrade: { select: { code: true } }, tank: { select: { code: true } }, station: { select: { code: true, name: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 2000,
    });
    let litersMilli = 0n;
    let totalCostMnt = 0n;
    const byGrade = new Map<string, { litersMilli: bigint; costMnt: bigint }>();
    const bySupplier = new Map<string, { litersMilli: bigint; costMnt: bigint }>();
    const items = rows.map((d) => {
      const lm = toMilliUnits(d.liters.toString());
      litersMilli += lm;
      totalCostMnt += d.totalCostMnt;
      const gk = d.fuelGrade.code;
      const g = byGrade.get(gk) ?? { litersMilli: 0n, costMnt: 0n };
      byGrade.set(gk, { litersMilli: g.litersMilli + lm, costMnt: g.costMnt + d.totalCostMnt });
      const sk = d.supplier?.name ?? '—';
      const s = bySupplier.get(sk) ?? { litersMilli: 0n, costMnt: 0n };
      bySupplier.set(sk, { litersMilli: s.litersMilli + lm, costMnt: s.costMnt + d.totalCostMnt });
      return {
        id: d.id,
        receivedAt: d.receivedAt,
        stationLabel: `${d.station.code} — ${d.station.name}`,
        grade: d.fuelGrade.code,
        tankCode: d.tank?.code ?? null,
        supplier: d.supplier?.name ?? null,
        documentNo: d.documentNo,
        liters: d.liters.toString(),
        unitCostMnt: d.unitCostMnt,
        totalCostMnt: d.totalCostMnt,
      };
    });
    return {
      from: q.from,
      to: q.to,
      totals: { count: rows.length, liters: milliToDecimalString(litersMilli), totalCostMnt },
      byGrade: [...byGrade.entries()].map(([grade, v]) => ({ grade, liters: milliToDecimalString(v.litersMilli), costMnt: v.costMnt })),
      bySupplier: [...bySupplier.entries()].map(([supplier, v]) => ({ supplier, liters: milliToDecimalString(v.litersMilli), costMnt: v.costMnt })),
      items,
    };
  }

  /** Нөөцийн үнэлгээ — одоогийн үлдэгдэл × өртөг (бараа: costMnt; түлш: жигнэсэн дундаж нийлүүлэлт). */
  async valuation(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const [levels, tanks, delAgg] = await Promise.all([
      this.prisma.stockLevel.findMany({ where: { stationId }, include: { product: { select: { name: true, sku: true, unit: true, costMnt: true } } } }),
      this.prisma.fuelTank.findMany({ where: { stationId, deletedAt: null }, include: { fuelGrade: { select: { id: true, code: true } } } }),
      this.prisma.fuelDelivery.groupBy({ by: ['fuelGradeId'], where: { stationId, status: FuelDeliveryStatus.RECEIVED, deletedAt: null }, _sum: { liters: true, totalCostMnt: true } }),
    ]);
    // Грейд тус бүрийн жигнэсэн дундаж литрийн өртөг (milli литрээр)
    const avgCostByGrade = new Map<string, { sumCost: bigint; sumLitersMilli: bigint }>();
    for (const d of delAgg) {
      avgCostByGrade.set(d.fuelGradeId, { sumCost: d._sum.totalCostMnt ?? 0n, sumLitersMilli: toMilliUnits(d._sum.liters?.toString() ?? '0') });
    }

    let productValueMnt = 0n;
    const products = levels.map((l) => {
      const qtyMilli = toMilliUnits(l.quantity.toString());
      const cost = l.product.costMnt ?? 0n;
      const value = divRoundHalfUp(qtyMilli * cost, 1000n);
      productValueMnt += value;
      return { productId: l.productId, name: l.product.name, sku: l.product.sku, unit: l.product.unit, quantity: l.quantity.toString(), unitCostMnt: cost, valueMnt: value };
    });

    let fuelValueMnt = 0n;
    const fuelTanks = tanks.map((t) => {
      const litersMilli = toMilliUnits(t.currentLiters.toString());
      const avg = avgCostByGrade.get(t.fuelGradeId);
      const value = avg && avg.sumLitersMilli > 0n ? divRoundHalfUp(litersMilli * avg.sumCost, avg.sumLitersMilli) : 0n;
      fuelValueMnt += value;
      return { tankId: t.id, code: t.code, grade: t.fuelGrade.code, currentLiters: t.currentLiters.toString(), valueMnt: value, costBasis: avg && avg.sumLitersMilli > 0n ? 'weighted-avg-delivery' : 'unknown' };
    });

    return { stationId, products, fuelTanks, totals: { productValueMnt, fuelValueMnt, totalValueMnt: productValueMnt + fuelValueMnt } };
  }

  /** Нөөцийн хөдөлгөөний тайлан — муж + төрөл/бараа шүүлт (ledger). */
  async movementReport(user: AuthUser, q: MovementReportQuery) {
    await assertStationAccess(this.prisma, user, q.stationId);
    const { start, end } = this.ubRange(q.from, q.to);
    const where: Prisma.StockMovementWhereInput = {
      stationId: q.stationId,
      createdAt: { gte: start, lt: end },
      ...(q.type ? { type: q.type } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
    };
    const rows = await this.prisma.stockMovement.findMany({
      where,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;
    return {
      from: q.from,
      to: q.to,
      stationId: q.stationId,
      count: rows.length,
      byType,
      items: rows.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        type: m.type,
        product: m.product?.name ?? null,
        fuelTankId: m.fuelTankId,
        quantity: m.quantity.toString(),
        unitCostMnt: m.unitCostMnt,
        reason: m.reason,
        refType: m.refType,
        refId: m.refId,
      })),
    };
  }

  /** Түлшний хөдөлгөөн / тулгалт — сав тус бүрээр: нийлүүлэлт, зарсан, буцаалт, засвар (ledger §7.2/§7.4). */
  async fuelReconciliation(user: AuthUser, q: FuelReconQuery) {
    await assertStationAccess(this.prisma, user, q.stationId);
    const { start, end } = this.ubRange(q.from, q.to);
    const tanks = await this.prisma.fuelTank.findMany({
      where: { stationId: q.stationId, deletedAt: null },
      include: { fuelGrade: { select: { code: true } } },
      orderBy: { code: 'asc' },
    });
    const moves = await this.prisma.stockMovement.findMany({
      where: { stationId: q.stationId, fuelTankId: { not: null }, createdAt: { gte: start, lt: end } },
      select: { fuelTankId: true, type: true, quantity: true, refType: true },
    });
    // Сав тус бүрийн задаргаа
    const acc = new Map<string, { deliveredMilli: bigint; dispensedMilli: bigint; returnedMilli: bigint; adjustedMilli: bigint }>();
    for (const m of moves) {
      const id = m.fuelTankId as string;
      const a = acc.get(id) ?? { deliveredMilli: 0n, dispensedMilli: 0n, returnedMilli: 0n, adjustedMilli: 0n };
      const qMilli = toMilliUnits(m.quantity.toString());
      if (m.type === 'RECEIPT') a.deliveredMilli += qMilli;
      else if (m.type === 'SALE') a.dispensedMilli += -qMilli; // sale нь сөрөг → зарсан эерэг
      else if (m.type === 'ADJUSTMENT' && (m.refType === 'refund' || m.refType === 'void')) a.returnedMilli += qMilli;
      else a.adjustedMilli += qMilli; // бусад засвар (тэмдэгтэй)
      acc.set(id, a);
    }
    const rows = tanks.map((t) => {
      const a = acc.get(t.id) ?? { deliveredMilli: 0n, dispensedMilli: 0n, returnedMilli: 0n, adjustedMilli: 0n };
      const netMilli = a.deliveredMilli - a.dispensedMilli + a.returnedMilli + a.adjustedMilli;
      return {
        tankId: t.id,
        code: t.code,
        grade: t.fuelGrade.code,
        currentLiters: t.currentLiters.toString(),
        delivered: milliToDecimalString(a.deliveredMilli),
        dispensed: milliToDecimalString(a.dispensedMilli),
        returned: milliToDecimalString(a.returnedMilli),
        adjusted: milliToDecimalString(a.adjustedMilli),
        netChange: milliToDecimalString(netMilli),
      };
    });
    return { from: q.from, to: q.to, stationId: q.stationId, tanks: rows };
  }
}
