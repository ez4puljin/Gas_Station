import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreatePurchaseInput,
  type CreateSupplierInput,
  lineTotalMnt,
  milliToDecimalString,
  type PurchaseListQuery,
  type ReceivePurchaseLineInput,
  type SupplierAdjustmentInput,
  type SupplierPaymentInput,
  toMilliUnits,
  type UpdateSupplierInput,
} from '@fuel/schemas';
import {
  AuditAction,
  type AuthUser,
  FuelDeliveryStatus,
  SaleItemType,
  StockMovementType,
  SupplierTxnType,
} from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';
import { RealtimeEvent, RealtimeGateway } from '../realtime/realtime.gateway';

const dec = (milli: bigint) => new Prisma.Decimal(milliToDecimalString(milli));

/**
 * Худалдан авалт (procurement) + нийлүүлэгчийн өглөг (AP) — CLAUDE.md §9.
 * Нэг нийлүүлэгчээс түлш/бараа авч ОЛОН салбар/сав руу хуваарилна (мөр = нэг салбар).
 * Мөр PENDING→RECEIVED: хүлээн авахад сав/нөөц нэмэгдэж, нийлүүлэгчийн өглөг (balanceMnt) өснө.
 * Бүх балансын/нөөцийн өөрчлөлт transaction + FOR UPDATE + ledger + audit (§2.3, §2.4, §8).
 */
@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private notifyInventory(companyId: string, stationId: string): void {
    this.realtime.emitToStation(companyId, stationId, RealtimeEvent.INVENTORY_CHANGED, { stationId });
  }

  // ── Нийлүүлэгчийн мөрийг түгжих (балансын мутацын өмнө) ──
  private async lockSupplier(tx: Prisma.TransactionClient, id: string, companyId: string) {
    await tx.$queryRaw`SELECT id FROM "supplier" WHERE id = ${id} FOR UPDATE`;
    const supplier = await tx.supplier.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!supplier) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });
    }
    return supplier;
  }

  // ════════════════════════════════════════════════════════
  //  Нийлүүлэгч (Supplier) — CRUD + өглөг (AP)
  // ════════════════════════════════════════════════════════

  listSuppliers(user: AuthUser) {
    return this.prisma.supplier.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async getSupplier(user: AuthUser, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });
    }
    return supplier;
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

  async updateSupplier(user: AuthUser, id: string, input: UpdateSupplierInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });
      const supplier = await tx.supplier.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          contact: input.contact === undefined ? undefined : input.contact,
          phone: input.phone === undefined ? undefined : input.phone,
          regNo: input.regNo === undefined ? undefined : input.regNo,
          isActive: input.isActive ?? undefined,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.UPDATE, entity: 'Supplier', entityId: id, before, after: supplier, ip },
        tx,
      );
      return supplier;
    });
  }

  async deleteSupplier(user: AuthUser, id: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.supplier.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });
      if (before.balanceMnt !== 0n) {
        throw new BadRequestException({ code: 'SUPPLIER_HAS_BALANCE', message: 'Өглөгтэй нийлүүлэгчийг устгах боломжгүй' });
      }
      const supplier = await tx.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.SOFT_DELETE, entity: 'Supplier', entityId: id, before, after: supplier, ip },
        tx,
      );
      return { id, deleted: true };
    });
  }

  /** Нийлүүлэгчид төлбөр төлөх — өглөгийг бууруулна (§8 audit). */
  async recordPayment(user: AuthUser, id: string, input: SupplierPaymentInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await this.lockSupplier(tx, id, user.companyId);
      const delta = -input.amount; // төлбөр → өглөг хорогдоно
      const newBalance = supplier.balanceMnt + delta;
      await tx.supplier.update({ where: { id: supplier.id }, data: { balanceMnt: newBalance } });
      const txn = await tx.supplierTransaction.create({
        data: {
          supplierId: supplier.id,
          type: SupplierTxnType.PAYMENT,
          amountMnt: delta,
          balanceAfterMnt: newBalance,
          method: input.method,
          reason: input.note ?? null,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.SUPPLIER_PAYMENT,
          entity: 'Supplier',
          entityId: supplier.id,
          before: { balanceMnt: supplier.balanceMnt },
          after: { balanceMnt: newBalance, txn },
          ip,
        },
        tx,
      );
      return { supplierId: supplier.id, balanceMnt: newBalance, transaction: txn };
    });
  }

  /** Гар засвар — тэмдэгтэй дүн, reason заавал (§2.7), audit (§8). */
  async adjust(user: AuthUser, id: string, input: SupplierAdjustmentInput, ip: string | null) {
    if (input.amountMnt === 0n) {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Засварын дүн 0 байж болохгүй' });
    }
    return this.prisma.$transaction(async (tx) => {
      const supplier = await this.lockSupplier(tx, id, user.companyId);
      const newBalance = supplier.balanceMnt + input.amountMnt;
      await tx.supplier.update({ where: { id: supplier.id }, data: { balanceMnt: newBalance } });
      const txn = await tx.supplierTransaction.create({
        data: {
          supplierId: supplier.id,
          type: SupplierTxnType.ADJUSTMENT,
          amountMnt: input.amountMnt,
          balanceAfterMnt: newBalance,
          reason: input.reason,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.SUPPLIER_ADJUST,
          entity: 'Supplier',
          entityId: supplier.id,
          before: { balanceMnt: supplier.balanceMnt },
          after: { balanceMnt: newBalance, txn },
          ip,
        },
        tx,
      );
      return { supplierId: supplier.id, balanceMnt: newBalance, transaction: txn };
    });
  }

  /** Нийлүүлэгчийн тооцооны хуулга (subledger). */
  async transactions(user: AuthUser, id: string, page: number, pageSize: number) {
    await this.getSupplier(user, id); // company-scope шалгана
    const where: Prisma.SupplierTransactionWhereInput = { supplierId: id };
    const [items, total] = await Promise.all([
      this.prisma.supplierTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplierTransaction.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Өглөгийн дэвтэр (ledger) — нэг нийлүүлэгч, огнооны муж (§7.4 толдол).
   * Эхний үлдэгдэл = мужийн өмнөх сүүлчийн balanceAfterMnt. Дебет = өглөг нэмэгдсэн
   * (RECEIPT, +ADJUSTMENT); Кредит = барагдсан (PAYMENT, -ADJUSTMENT). Эцсийн = эхний+дебет−кредит.
   */
  async ledger(user: AuthUser, id: string, from: string, to: string) {
    const supplier = await this.getSupplier(user, id);
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    const start = new Date(`${from}T00:00:00+08:00`);
    const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);

    const [priorTxn, rows] = await Promise.all([
      this.prisma.supplierTransaction.findFirst({
        where: { supplierId: id, createdAt: { lt: start } },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfterMnt: true },
      }),
      this.prisma.supplierTransaction.findMany({
        where: { supplierId: id, createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const purchaseIds = [...new Set(rows.map((r) => r.purchaseId).filter((x): x is string => !!x))];
    const purchases = purchaseIds.length
      ? await this.prisma.purchase.findMany({
          where: { id: { in: purchaseIds } },
          select: { id: true, purchaseNo: true },
        })
      : [];
    const purchaseById = new Map(purchases.map((p) => [p.id, p]));

    // Гүйлгээ дээр double-click хийхэд харагдах бараа/түлш — RECEIPT мөрийн худалдан авалтын мөрөөс.
    const lineIds = [...new Set(rows.map((r) => r.purchaseLineId).filter((x): x is string => !!x))];
    const lines = lineIds.length
      ? await this.prisma.purchaseLine.findMany({
          where: { id: { in: lineIds } },
          include: {
            fuelGrade: { select: { name: true, code: true } },
            tank: { select: { code: true } },
            product: { select: { name: true, unit: true, sku: true } },
          },
        })
      : [];
    const lineById = new Map(lines.map((l) => [l.id, l]));

    const openingMnt = priorTxn?.balanceAfterMnt ?? 0n;
    let totalDebitMnt = 0n;
    let totalCreditMnt = 0n;
    const entries = rows.map((r) => {
      const debit = r.amountMnt > 0n ? r.amountMnt : 0n;
      const credit = r.amountMnt < 0n ? -r.amountMnt : 0n;
      totalDebitMnt += debit;
      totalCreditMnt += credit;
      const line = r.purchaseLineId ? lineById.get(r.purchaseLineId) : null;
      const items = line
        ? [
            {
              itemType: line.itemType,
              name:
                line.itemType === SaleItemType.FUEL
                  ? `${line.fuelGrade?.name ?? 'Түлш'}${line.tank ? ` — ${line.tank.code}` : ''}`
                  : (line.product?.name ?? 'Бараа'),
              sku: line.product?.sku ?? null,
              quantity: line.quantity.toString(),
              unit: line.product?.unit ?? (line.itemType === SaleItemType.FUEL ? 'л' : ''),
              unitCostMnt: line.unitCostMnt,
              totalCostMnt: line.totalCostMnt,
            },
          ]
        : [];
      return {
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        method: r.method,
        reason: r.reason,
        purchaseId: r.purchaseId,
        purchaseNo: r.purchaseId ? (purchaseById.get(r.purchaseId)?.purchaseNo ?? null) : null,
        debitMnt: debit,
        creditMnt: credit,
        balanceAfterMnt: r.balanceAfterMnt,
        items,
      };
    });
    const closingMnt = openingMnt + totalDebitMnt - totalCreditMnt;

    return {
      from,
      to,
      companyName: company?.name ?? null,
      supplier: { id: supplier.id, name: supplier.name, regNo: supplier.regNo, phone: supplier.phone },
      openingMnt,
      totalDebitMnt,
      totalCreditMnt,
      closingMnt,
      entries,
    };
  }

  /** Өглөгийн нэгдсэн тайлан (бүх нийлүүлэгч) — admin/accountant. */
  async payables(user: AuthUser) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { balanceMnt: 'desc' },
    });
    let totalPayableMnt = 0n;
    for (const s of suppliers) if (s.balanceMnt > 0n) totalPayableMnt += s.balanceMnt;
    return {
      count: suppliers.length,
      totalPayableMnt,
      suppliers: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        contact: s.contact,
        regNo: s.regNo,
        balanceMnt: s.balanceMnt,
        isActive: s.isActive,
      })),
    };
  }

  // ════════════════════════════════════════════════════════
  //  Худалдан авалт (Purchase) — олон салбар хуваарилалт
  // ════════════════════════════════════════════════════════

  private readonly purchaseInclude = {
    supplier: { select: { id: true, name: true } },
    lines: {
      include: {
        station: { select: { id: true, code: true, name: true } },
        fuelGrade: { select: { id: true, code: true, name: true } },
        tank: { select: { id: true, code: true } },
        product: { select: { id: true, name: true, sku: true, unit: true } },
      },
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.PurchaseInclude;

  /** UB (Asia/Ulaanbaatar, +08) календарийн он/сар/өдөр — баримтын дугаарт. */
  private ubYmd(now: Date): string {
    const ub = new Date(now.getTime() + 8 * 3600 * 1000);
    const y = ub.getUTCFullYear();
    const m = String(ub.getUTCMonth() + 1).padStart(2, '0');
    const d = String(ub.getUTCDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  /**
   * Худалдан авалт үүсгэх — мөр бүр нэг салбарын нэг сав (түлш) ЭСВЭЛ нэг бараа руу.
   * Мөрүүд PENDING төлөвтэй үүснэ (нөөц хараахан өөрчлөгдөхгүй — receive дээр). Өртөг = bigint MNT,
   * хэмжээ = milli-аар тооцоод Decimal-д хадгална. Салбар бүрийн хандах эрхийг шалгана (§2.2).
   */
  async createPurchase(user: AuthUser, input: CreatePurchaseInput, ip: string | null) {
    const result = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, companyId: user.companyId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Нийлүүлэгч олдсонгүй' });

      // Мөр бүрийг бэлдэх + бүх лавлагааг (салбар/сав/грейд/бараа) шалгах.
      const prepared: Prisma.PurchaseLineCreateWithoutPurchaseInput[] = [];
      let totalCostMnt = 0n;
      for (const line of input.lines) {
        await assertStationAccess(tx, user, line.stationId);
        const qtyMilli = toMilliUnits(line.quantity);
        if (qtyMilli <= 0n) {
          throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Тоо хэмжээ 0-ээс их байх ёстой' });
        }
        const lineTotal = lineTotalMnt(line.unitCostMnt, qtyMilli);
        totalCostMnt += lineTotal;

        const base = {
          station: { connect: { id: line.stationId } },
          itemType: line.itemType,
          quantity: dec(qtyMilli),
          unitCostMnt: line.unitCostMnt,
          totalCostMnt: lineTotal,
        };

        if (line.itemType === SaleItemType.FUEL) {
          const tank = await tx.fuelTank.findFirst({
            where: { id: line.tankId, stationId: line.stationId, deletedAt: null },
            select: { id: true, fuelGradeId: true },
          });
          if (!tank) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });
          if (tank.fuelGradeId !== line.fuelGradeId) {
            throw new BadRequestException({ code: 'TANK_GRADE_MISMATCH', message: 'Сонгосон сав сонгосон түлшний грейдтэй таарахгүй байна' });
          }
          prepared.push({
            ...base,
            fuelGrade: { connect: { id: line.fuelGradeId } },
            tank: { connect: { id: line.tankId } },
          });
        } else {
          const product = await tx.product.findFirst({
            where: { id: line.productId, companyId: user.companyId, deletedAt: null },
            select: { id: true },
          });
          if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
          prepared.push({ ...base, product: { connect: { id: line.productId } } });
        }
      }

      // Баримтын дугаар: P-YYYY/MM/DD-0001 (компани дотор, өдрөөр).
      const now = new Date();
      const ymd = this.ubYmd(now);
      const dayStart = new Date(`${this.ubYmd(now).replace(/\//g, '-')}T00:00:00+08:00`);
      const seq = await tx.purchase.count({
        where: { companyId: user.companyId, createdAt: { gte: dayStart } },
      });
      const purchaseNo = `P-${ymd}-${String(seq + 1).padStart(4, '0')}`;

      const purchase = await tx.purchase.create({
        data: {
          companyId: user.companyId,
          supplierId: input.supplierId,
          purchaseNo,
          documentNo: input.documentNo ?? null,
          note: input.note ?? null,
          totalCostMnt,
          createdById: user.sub,
          lines: { create: prepared },
        },
        include: this.purchaseInclude,
      });

      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.PURCHASE_CREATE,
          entity: 'Purchase',
          entityId: purchase.id,
          after: purchase,
          ip,
        },
        tx,
      );
      return purchase;
    });
    // Үүсгэх хариу нь get/list-тэй ИЖИЛ хэлбэртэй (pendingCount/status/lines нэгдсэн).
    return this.serializePurchase(result);
  }

  /** Худалдан авалтын жагсаалт — компани-хэмжээнд, шүүлттэй. */
  async listPurchases(user: AuthUser, q: PurchaseListQuery) {
    const where: Prisma.PurchaseWhereInput = { companyId: user.companyId, deletedAt: null };
    if (q.supplierId) where.supplierId = q.supplierId;
    if (q.stationId || q.status) {
      where.lines = { some: { ...(q.stationId ? { stationId: q.stationId } : {}), ...(q.status ? { status: q.status } : {}) } };
    }
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(`${q.from}T00:00:00+08:00`);
      if (q.to) where.createdAt.lt = new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    }
    const rows = await this.prisma.purchase.findMany({
      where,
      include: this.purchaseInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((p) => this.serializePurchase(p));
  }

  async getPurchase(user: AuthUser, id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: this.purchaseInclude,
    });
    if (!purchase) throw new NotFoundException({ code: 'PURCHASE_NOT_FOUND', message: 'Худалдан авалт олдсонгүй' });
    return this.serializePurchase(purchase);
  }

  private serializePurchase(p: Prisma.PurchaseGetPayload<{ include: typeof ProcurementService.prototype.purchaseInclude }>) {
    const lines = p.lines.map((l) => ({
      id: l.id,
      stationId: l.stationId,
      stationLabel: `${l.station.code} — ${l.station.name}`,
      itemType: l.itemType,
      status: l.status,
      fuelGradeId: l.fuelGradeId,
      gradeLabel: l.fuelGrade ? l.fuelGrade.name : null,
      tankId: l.tankId,
      tankCode: l.tank?.code ?? null,
      productId: l.productId,
      productName: l.product?.name ?? null,
      unit: l.product?.unit ?? (l.itemType === SaleItemType.FUEL ? 'л' : null),
      quantity: l.quantity.toString(),
      unitCostMnt: l.unitCostMnt,
      totalCostMnt: l.totalCostMnt,
      receivedAt: l.receivedAt,
    }));
    const received = lines.filter((l) => l.status === 'RECEIVED').length;
    const cancelled = lines.filter((l) => l.status === 'CANCELLED').length;
    const pending = lines.filter((l) => l.status === 'PENDING').length;
    return {
      id: p.id,
      purchaseNo: p.purchaseNo,
      documentNo: p.documentNo,
      note: p.note,
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      totalCostMnt: p.totalCostMnt,
      createdAt: p.createdAt,
      lineCount: lines.length,
      receivedCount: received,
      cancelledCount: cancelled,
      pendingCount: pending,
      status: pending > 0 ? 'PARTIAL' : received > 0 ? 'RECEIVED' : 'CANCELLED',
      lines,
    };
  }

  /**
   * Худалдан авалтын мөр хүлээн авах (PENDING→RECEIVED) — атомик:
   *  түлш → FuelDelivery(RECEIVED) + сав currentLiters↑ + StockMovement(RECEIPT);
   *  бараа → StockLevel↑ + StockMovement(RECEIPT);
   *  + нийлүүлэгчийн өглөг (SupplierTransaction RECEIPT, balanceMnt↑) + audit (§2.3, §8).
   */
  async receiveLine(
    user: AuthUser,
    purchaseId: string,
    lineId: string,
    input: ReceivePurchaseLineInput,
    ip: string | null,
  ) {
    const { result, stationId } = await this.prisma.$transaction(async (tx) => {
      // Мөрийг түгжинэ (давхар хүлээн авалтаас сэргийлнэ).
      await tx.$queryRaw`SELECT id FROM "purchase_line" WHERE id = ${lineId} FOR UPDATE`;
      const line = await tx.purchaseLine.findFirst({
        where: { id: lineId, purchaseId },
        include: { purchase: { select: { id: true, companyId: true, supplierId: true, documentNo: true } } },
      });
      if (!line || line.purchase.companyId !== user.companyId) {
        throw new NotFoundException({ code: 'PURCHASE_LINE_NOT_FOUND', message: 'Худалдан авалтын мөр олдсонгүй' });
      }
      if (line.status !== 'PENDING') {
        throw new BadRequestException({ code: 'LINE_NOT_PENDING', message: 'Зөвхөн хүлээгдэж буй мөрийг хүлээн авна' });
      }
      await assertStationAccess(tx, user, line.stationId);

      const qtyMilli = toMilliUnits(line.quantity.toString());
      const qtyDec = dec(qtyMilli);
      const docNo = input.documentNo ?? line.purchase.documentNo ?? null;

      let fuelDeliveryId: string | null = null;
      let stockMovementId: string | null = null;

      if (line.itemType === SaleItemType.FUEL) {
        const tank = await tx.fuelTank.findFirst({
          where: { id: line.tankId ?? undefined, stationId: line.stationId, deletedAt: null },
          select: { id: true, fuelGradeId: true },
        });
        if (!tank) throw new NotFoundException({ code: 'TANK_NOT_FOUND', message: 'Сав олдсонгүй' });
        const delivery = await tx.fuelDelivery.create({
          data: {
            stationId: line.stationId,
            supplierId: line.purchase.supplierId,
            fuelGradeId: tank.fuelGradeId,
            tankId: tank.id,
            status: FuelDeliveryStatus.RECEIVED,
            liters: qtyDec,
            unitCostMnt: line.unitCostMnt,
            totalCostMnt: line.totalCostMnt,
            documentNo: docNo,
            receivedById: user.employeeId,
            receivedAt: new Date(),
          },
        });
        await tx.fuelTank.update({ where: { id: tank.id }, data: { currentLiters: { increment: qtyDec } } });
        await tx.stockMovement.create({
          data: {
            stationId: line.stationId,
            type: StockMovementType.RECEIPT,
            fuelTankId: tank.id,
            quantity: qtyDec,
            unitCostMnt: line.unitCostMnt,
            refType: 'purchase',
            refId: line.id,
            actorId: user.sub,
          },
        });
        fuelDeliveryId = delivery.id;
      } else {
        const product = await tx.product.findFirst({
          where: { id: line.productId ?? undefined, companyId: user.companyId, deletedAt: null },
          select: { id: true },
        });
        if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
        await tx.stockLevel.upsert({
          where: { stationId_productId: { stationId: line.stationId, productId: product.id } },
          update: { quantity: { increment: qtyDec } },
          create: { stationId: line.stationId, productId: product.id, quantity: qtyDec },
        });
        const movement = await tx.stockMovement.create({
          data: {
            stationId: line.stationId,
            type: StockMovementType.RECEIPT,
            productId: product.id,
            quantity: qtyDec,
            unitCostMnt: line.unitCostMnt,
            refType: 'purchase',
            refId: line.id,
            actorId: user.sub,
          },
        });
        stockMovementId = movement.id;
      }

      // Нийлүүлэгчийн өглөг нэмэгдэнэ (мөр хүлээн авагдсанаар).
      const supplier = await this.lockSupplier(tx, line.purchase.supplierId, user.companyId);
      const newBalance = supplier.balanceMnt + line.totalCostMnt;
      await tx.supplier.update({ where: { id: supplier.id }, data: { balanceMnt: newBalance } });
      await tx.supplierTransaction.create({
        data: {
          supplierId: supplier.id,
          type: SupplierTxnType.RECEIPT,
          amountMnt: line.totalCostMnt,
          balanceAfterMnt: newBalance,
          purchaseId: line.purchase.id,
          purchaseLineId: line.id, // тайлангийн drill-down: яг тухайн мөрийн бараа/түлш
          actorId: user.sub,
        },
      });

      const updated = await tx.purchaseLine.update({
        where: { id: line.id },
        data: {
          status: 'RECEIVED',
          receivedById: user.employeeId,
          receivedAt: new Date(),
          fuelDeliveryId,
          stockMovementId,
        },
      });

      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.PURCHASE_RECEIVE,
          entity: 'PurchaseLine',
          entityId: line.id,
          after: { line: updated, fuelDeliveryId, stockMovementId, supplierBalanceMnt: newBalance },
          stationId: line.stationId,
          ip,
        },
        tx,
      );
      return { result: updated, stationId: line.stationId };
    });
    this.notifyInventory(user.companyId, stationId);
    return result;
  }

  /** Хүлээгдэж буй мөрийг цуцлах (нөөц/өглөгт нөлөөлөхгүй). */
  async cancelLine(user: AuthUser, purchaseId: string, lineId: string, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "purchase_line" WHERE id = ${lineId} FOR UPDATE`;
      const line = await tx.purchaseLine.findFirst({
        where: { id: lineId, purchaseId },
        include: { purchase: { select: { companyId: true } } },
      });
      if (!line || line.purchase.companyId !== user.companyId) {
        throw new NotFoundException({ code: 'PURCHASE_LINE_NOT_FOUND', message: 'Худалдан авалтын мөр олдсонгүй' });
      }
      if (line.status !== 'PENDING') {
        throw new BadRequestException({ code: 'LINE_NOT_PENDING', message: 'Зөвхөн хүлээгдэж буй мөрийг цуцална' });
      }
      await assertStationAccess(tx, user, line.stationId);
      const updated = await tx.purchaseLine.update({ where: { id: line.id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.PURCHASE_CANCEL,
          entity: 'PurchaseLine',
          entityId: line.id,
          before: line,
          after: updated,
          stationId: line.stationId,
          ip,
        },
        tx,
      );
      return updated;
    });
  }
}
