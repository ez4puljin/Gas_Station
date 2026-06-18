import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreateSaleInput,
  divRoundHalfUp,
  lineTotalMnt,
  milliToDecimalString,
  type RefundSaleInput,
  type SalesListQuery,
  splitVatFromGross,
  toMilliUnits,
  type VoidSaleInput,
} from '@fuel/schemas';
import {
  AuditAction,
  type AuthUser,
  FUEL_GRADE_LABEL,
  type FuelGradeCode,
  PAYMENT_METHOD_LABEL,
  PaymentMethod,
  SaleItemType,
  SaleStatus,
  StockMovementType,
} from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { RealtimeEvent, RealtimeGateway } from '../realtime/realtime.gateway';
import { PricingService } from './pricing.service';

const saleInclude = { lines: true, payments: true } satisfies Prisma.SaleInclude;

/** Нэг мөрийн бэлдсэн тооцоо (transaction дотор). */
interface PreparedLine {
  type: SaleItemType;
  productId: string | null;
  fuelGradeId: string | null;
  nozzleId: string | null;
  tankId: string | null; // FUEL үед нөөц хорогдуулах сав
  description: string;
  qtyMilli: bigint;
  unitPriceMnt: bigint;
  lineTotalMnt: bigint;
  vatMnt: bigint;
}

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly realtime: RealtimeGateway,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Борлуулалт үүсгэх — CLAUDE.md §2.3 (атомик), §8 (audit), §9 (idempotency), §10 (scope).
   * Үнэ/тооцоог СЕРВЕР баталгаажуулна (§14) — client-ийн дүнд итгэхгүй.
   */
  async createSale(user: AuthUser, input: CreateSaleInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);

    // Зээлийн төлбөр байвал харилцагч заавал (авлага үүснэ)
    const creditAmount = input.payments
      .filter((p) => p.method === PaymentMethod.CREDIT)
      .reduce((sum, p) => sum + p.amount, 0n);
    if (creditAmount > 0n && !input.customerId) {
      throw new BadRequestException({
        code: 'CUSTOMER_REQUIRED',
        message: 'Зээлийн борлуулалтад харилцагч заавал сонгоно',
      });
    }

    // Idempotency — өмнө sync хийгдсэн бол хуучин борлуулалтыг буцаана (§9).
    // clientGeneratedId глобал unique тул өөр салбар/tenant-ийн дүнг буцаахаас сэргийлж
    // stationId таарч буйг шалгана (§10 cross-tenant leak хаах).
    const existing = await this.prisma.sale.findUnique({
      where: { clientGeneratedId: input.clientGeneratedId },
      include: saleInclude,
    });
    if (existing) {
      if (existing.stationId !== input.stationId) {
        throw new ConflictException({
          code: 'CLIENT_ID_CONFLICT',
          message: 'clientGeneratedId давхцаж байна',
        });
      }
      return existing;
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // 1) Нээлттэй ээлж шаардлагатай (§7.1)
        const shift = await tx.shift.findFirst({
          where: { id: input.shiftId, stationId: input.stationId, status: 'OPEN' },
        });
        if (!shift) {
          throw new BadRequestException({
            code: 'SHIFT_NOT_OPEN',
            message: 'Нээлттэй ээлж олдсонгүй. Эхлээд ээлж нээнэ үү',
          });
        }

        // Харилцагч заасан бол КОМПАНИД харьяалагдахыг шалгана (зээлгүй ч §10 cross-tenant хаах)
        if (input.customerId) {
          const c = await tx.customer.findFirst({
            where: { id: input.customerId, companyId: user.companyId, deletedAt: null },
            select: { id: true },
          });
          if (!c) {
            throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Харилцагч олдсонгүй' });
          }
        }

        // 2) Мөр бүрийг сервер дээр тооцоолох. Түлш нь литр ЭСВЭЛ мөнгөн дүнгээр
        //    ирж болох тул prepareFuelLine дотроо qtyMilli-г бодно (§ мөнгөн дүнгээр авах).
        const prepared: PreparedLine[] = [];
        for (const line of input.lines) {
          if (line.type === SaleItemType.FUEL) {
            prepared.push(await this.prepareFuelLine(tx, input.stationId, line));
          } else {
            const qtyMilli = toMilliUnits(line.quantity ?? 0);
            if (qtyMilli <= 0n) {
              throw new BadRequestException({
                code: 'INVALID_QUANTITY',
                message: 'Тоо хэмжээ 0-ээс их байх ёстой',
              });
            }
            prepared.push(await this.prepareProductLine(tx, user.companyId, line, qtyMilli));
          }
        }

        // 3) Нийт дүн (VAT багтсан үнэ; vat-г ялгаж, net = total - vat)
        const totalMnt = prepared.reduce((sum, l) => sum + l.lineTotalMnt, 0n);
        const vatMnt = prepared.reduce((sum, l) => sum + l.vatMnt, 0n);
        const subtotalMnt = totalMnt - vatMnt;

        // 4) Төлбөр нийт дүнтэй тэнцэх ёстой
        const paid = input.payments.reduce((sum, p) => sum + p.amount, 0n);
        if (paid !== totalMnt) {
          throw new BadRequestException({
            code: 'PAYMENT_MISMATCH',
            message: 'Төлбөрийн нийлбэр борлуулалтын дүнтэй тэнцэхгүй байна',
          });
        }

        // 5) Борлуулалт + мөр + төлбөр (атомик)
        // 5.0) Order number — формат: `{C1}-{YYYY/MM/DD}-{0001}` (салбар × өдөр-ийн дараалал).
        //      UB цагаар өдрийн хил тооцно (DB-д UTC хадгалагдана, §2 ёсоор).
        //      `soldAt`-ийг тодорхой утга болгож өгөх нь — дараалал/огноо нэг л цаг дээр тулгуурлана.
        const now = new Date();
        const ubMs = now.getTime() + 8 * 3600 * 1000;
        const ub = new Date(ubMs);
        const yyyy = ub.getUTCFullYear();
        const mm = String(ub.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(ub.getUTCDate()).padStart(2, '0');
        const dateLabel = `${yyyy}/${mm}/${dd}`;
        const dayStartUtc = new Date(Date.UTC(yyyy, ub.getUTCMonth(), ub.getUTCDate()) - 8 * 3600 * 1000);
        const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);
        const stationRow = await tx.station.findUnique({
          where: { id: input.stationId },
          select: { code: true },
        });
        const todayCount = await tx.sale.count({
          where: { stationId: input.stationId, soldAt: { gte: dayStartUtc, lt: dayEndUtc } },
        });
        const seq = String(todayCount + 1).padStart(4, '0');
        const saleNumber = `${stationRow?.code ?? 'X'}-${dateLabel}-${seq}`;

        const sale = await tx.sale.create({
          data: {
            stationId: input.stationId,
            shiftId: input.shiftId,
            cashierId: user.employeeId,
            status: SaleStatus.COMPLETED,
            saleNumber,
            soldAt: now,
            subtotalMnt,
            vatMnt,
            totalMnt,
            customerType: input.customerType ?? null,
            customerTin: input.customerTin ?? null,
            customerId: input.customerId ?? null,
            clientGeneratedId: input.clientGeneratedId,
            lines: {
              create: prepared.map((l) => ({
                type: l.type,
                productId: l.productId,
                fuelGradeId: l.fuelGradeId,
                nozzleId: l.nozzleId,
                description: l.description,
                quantity: milliToDecimalString(l.qtyMilli),
                unitPriceMnt: l.unitPriceMnt,
                lineTotalMnt: l.lineTotalMnt,
                vatMnt: l.vatMnt,
              })),
            },
            payments: {
              create: input.payments.map((p) => ({
                method: p.method,
                amountMnt: p.amount,
                maskedPan: p.maskedPan ?? null,
                reference: p.reference ?? null,
              })),
            },
          },
          include: saleInclude,
        });

        // 6) Нөөц хорогдуулах + ledger (§7.2)
        for (const l of prepared) {
          await this.decrementStock(tx, input.stationId, sale.id, user.sub, l);
        }

        // 6.1) Зээлийн борлуулалт бол харилцагчийн авлага нэмэх (лимит шалгана) — атомик
        if (creditAmount > 0n && input.customerId) {
          await this.customers.chargeCreditInTx(tx, {
            customerId: input.customerId,
            companyId: user.companyId,
            amountMnt: creditAmount,
            saleId: sale.id,
            stationId: input.stationId,
            actorId: user.sub,
          });
        }

        // 7) Audit (§8) — мөн адил transaction дотор
        await this.audit.record(
          {
            actorId: user.sub,
            action: AuditAction.SALE,
            entity: 'Sale',
            entityId: sale.id,
            after: sale,
            stationId: input.stationId,
            ip,
          },
          tx,
        );

        return sale;
      });

      // Realtime — самбар/бусад төхөөрөмжид шууд мэдэгдэнэ (§4)
      this.realtime.emitToStation(user.companyId, input.stationId, RealtimeEvent.SALE_CREATED, {
        saleId: created.id,
        stationId: input.stationId,
        totalMnt: created.totalMnt.toString(),
        soldAt: created.soldAt.toISOString(),
        cashierId: created.cashierId,
      });
      return created;
    } catch (err) {
      // Зэрэгцээ давхар sync (race) — unique зөрчил гарвал хуучныг буцаана
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const dup = await this.prisma.sale.findUnique({
          where: { clientGeneratedId: input.clientGeneratedId },
          include: saleInclude,
        });
        if (dup && dup.stationId === input.stationId) return dup;
        throw new ConflictException({
          code: 'CLIENT_ID_CONFLICT',
          message: 'clientGeneratedId давхцаж байна',
        });
      }
      throw err;
    }
  }

  private async prepareFuelLine(
    tx: Prisma.TransactionClient,
    stationId: string,
    line: { fuelGradeId?: string; nozzleId?: string; quantity?: number | string; amountMnt?: bigint },
  ): Promise<PreparedLine> {
    const grade = await tx.fuelGrade.findFirst({
      where: { id: line.fuelGradeId, isActive: true },
    });
    if (!grade) {
      throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Түлшний грейд олдсонгүй' });
    }

    // Тоолуур заасан бол түүний сав, эс бөгөөс грейдийн идэвхтэй сав
    let tankId: string | null = null;
    if (line.nozzleId) {
      const nozzle = await tx.nozzle.findFirst({
        where: { id: line.nozzleId, tank: { stationId } },
      });
      if (!nozzle) {
        throw new NotFoundException({ code: 'NOZZLE_NOT_FOUND', message: 'Хошуу олдсонгүй' });
      }
      tankId = nozzle.tankId;
    } else {
      const tank = await tx.fuelTank.findFirst({
        where: { stationId, fuelGradeId: grade.id, deletedAt: null, isActive: true },
      });
      // Сав олдохгүй бол борлуулалтыг зогсооно — нөөцийн ledger-гүй түлш гарахаас сэргийлнэ (§7.2)
      if (!tank) {
        throw new BadRequestException({
          code: 'TANK_NOT_FOUND',
          message: 'Тухайн грейдийн идэвхтэй сав олдсонгүй',
        });
      }
      tankId = tank.id;
    }

    const unitPriceMnt = await this.pricing.getCurrentFuelPriceMnt(stationId, grade.id, tx);

    // Мөнгөн дүнгээр авах үед дүн нь ЯГ тэр (бэлэн мөнгө), литр = дүн / үнэ (3 орон).
    // Литрээр авах үед дүн = үнэ × литр. Хоёр горимыг refine-аар баталгаажуулсан.
    let qtyMilli: bigint;
    let total: bigint;
    if (line.amountMnt && line.amountMnt > 0n) {
      total = line.amountMnt;
      qtyMilli = divRoundHalfUp(line.amountMnt * 1000n, unitPriceMnt); // литр × 1000
    } else {
      qtyMilli = toMilliUnits(line.quantity ?? 0);
      total = lineTotalMnt(unitPriceMnt, qtyMilli);
    }
    if (qtyMilli <= 0n) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'Тоо хэмжээ 0-ээс их байх ёстой',
      });
    }
    const { vat } = splitVatFromGross(total); // түлш НӨАТ-тай

    return {
      type: SaleItemType.FUEL,
      productId: null,
      fuelGradeId: grade.id,
      nozzleId: line.nozzleId ?? null,
      tankId,
      description: FUEL_GRADE_LABEL[grade.code as FuelGradeCode] ?? grade.name,
      qtyMilli,
      unitPriceMnt,
      lineTotalMnt: total,
      vatMnt: vat,
    };
  }

  private async prepareProductLine(
    tx: Prisma.TransactionClient,
    companyId: string,
    line: { productId?: string },
    qtyMilli: bigint,
  ): Promise<PreparedLine> {
    const product = await tx.product.findFirst({
      where: { id: line.productId, companyId, deletedAt: null, isActive: true },
    });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Бараа олдсонгүй' });
    }
    const unitPriceMnt = product.priceMnt;
    const total = lineTotalMnt(unitPriceMnt, qtyMilli);
    const vat = product.isVatable ? splitVatFromGross(total).vat : 0n;

    return {
      type: SaleItemType.PRODUCT,
      productId: product.id,
      fuelGradeId: null,
      nozzleId: null,
      tankId: null,
      description: product.name,
      qtyMilli,
      unitPriceMnt,
      lineTotalMnt: total,
      vatMnt: vat,
    };
  }

  /** Борлуулалтаар нөөц хорогдуулж, StockMovement ledger-т бичнэ. */
  private async decrementStock(
    tx: Prisma.TransactionClient,
    stationId: string,
    saleId: string,
    actorId: string,
    line: PreparedLine,
  ): Promise<void> {
    const qtyDec = milliToDecimalString(line.qtyMilli);
    const negQtyDec = milliToDecimalString(-line.qtyMilli);

    if (line.type === SaleItemType.FUEL && line.tankId) {
      await tx.fuelTank.update({
        where: { id: line.tankId },
        data: { currentLiters: { decrement: new Prisma.Decimal(qtyDec) } },
      });
      await tx.stockMovement.create({
        data: {
          stationId,
          type: StockMovementType.SALE,
          fuelTankId: line.tankId,
          quantity: new Prisma.Decimal(negQtyDec),
          refType: 'sale',
          refId: saleId,
          actorId,
        },
      });
    } else if (line.type === SaleItemType.PRODUCT && line.productId) {
      await tx.stockLevel.upsert({
        where: { stationId_productId: { stationId, productId: line.productId } },
        update: { quantity: { decrement: new Prisma.Decimal(qtyDec) } },
        create: { stationId, productId: line.productId, quantity: new Prisma.Decimal(negQtyDec) },
      });
      await tx.stockMovement.create({
        data: {
          stationId,
          type: StockMovementType.SALE,
          productId: line.productId,
          quantity: new Prisma.Decimal(negQtyDec),
          refType: 'sale',
          refId: saleId,
          actorId,
        },
      });
    }
  }

  /** Цуцлалт — нөөцийг буцааж, төлөвийг VOIDED болгоно (шалтгаан + audit). */
  async voidSale(user: AuthUser, saleId: string, input: VoidSaleInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      // Мөрийг түгжинэ — зэрэгцээ цуцлалт нөөцийг хоёр дахин сэргээх (Read Committed дор
      // increment давхарлах)-аас сэргийлнэ (§2.3 атомик, TOCTOU race хаах).
      await tx.$queryRaw`SELECT id FROM "sale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.sale.findFirst({
        where: { id: saleId, deletedAt: null },
        include: saleInclude,
      });
      if (!sale) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Борлуулалт олдсонгүй' });
      await assertStationAccess(tx, user, sale.stationId);
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new ConflictException({
          code: 'SALE_NOT_VOIDABLE',
          message: 'Зөвхөн дууссан борлуулалтыг цуцална',
        });
      }
      // Хэсэгчилсэн буцаалт хийгдсэн борлуулалтыг цуцлахгүй — нөөц/мөнгийг давхар буцаахаас
      // сэргийлнэ (буцаалт хийсэн бол үлдсэнийг буцаалтаар үргэлжлүүлнэ).
      const refundCount = await tx.refund.count({ where: { saleId: sale.id } });
      if (refundCount > 0) {
        throw new ConflictException({
          code: 'SALE_HAS_REFUNDS',
          message: 'Буцаалт хийгдсэн борлуулалтыг цуцлах боломжгүй — буцаалтаар үргэлжлүүлнэ',
        });
      }

      // Нөөцийг буцаах — sale.lines биш, БОДИТ бичигдсэн sale хөдөлгөөнүүдээс тэгш хэмтэй
      // буцаана (олон сав/мөрийг зөв буцаах, tankless мөрөнд юу ч хийхгүй) — §7.2.
      const saleMovements = await tx.stockMovement.findMany({
        where: { refType: 'sale', refId: sale.id },
      });
      for (const mv of saleMovements) {
        const reverseQty = mv.quantity.negated(); // sale сөрөг тул буцаахад эерэг
        if (mv.fuelTankId) {
          await tx.fuelTank.update({
            where: { id: mv.fuelTankId },
            data: { currentLiters: { increment: reverseQty } },
          });
        } else if (mv.productId) {
          await tx.stockLevel.update({
            where: {
              stationId_productId: { stationId: sale.stationId, productId: mv.productId },
            },
            data: { quantity: { increment: reverseQty } },
          });
        }
        await tx.stockMovement.create({
          data: {
            stationId: sale.stationId,
            type: StockMovementType.ADJUSTMENT,
            productId: mv.productId,
            fuelTankId: mv.fuelTankId, // буцаасан савыг ledger-т зөв тэмдэглэнэ
            quantity: reverseQty,
            reason: `Цуцлалт: ${input.reason}`,
            refType: 'void',
            refId: sale.id,
            actorId: user.sub,
          },
        });
      }

      // Зээлийн борлуулалт бол харилцагчийн авлагыг бүрэн буцаах (§2 money integrity)
      const voidCredit = sale.payments
        .filter((p) => p.method === PaymentMethod.CREDIT)
        .reduce((s, p) => s + p.amountMnt, 0n);
      if (voidCredit > 0n && sale.customerId) {
        const { remaining } = await this.customers.creditReversibleForSale(tx, sale.id);
        if (remaining > 0n) {
          await this.customers.reverseCreditInTx(tx, {
            customerId: sale.customerId,
            companyId: user.companyId,
            amountMnt: remaining,
            saleId: sale.id,
            stationId: sale.stationId,
            actorId: user.sub,
            reason: `Цуцлалт: ${input.reason}`,
          });
        }
      }

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.VOIDED },
        include: saleInclude,
      });

      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.VOID,
          entity: 'Sale',
          entityId: sale.id,
          before: sale,
          after: updated,
          stationId: sale.stationId,
          ip,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Буцаалт — мөр сонгож нөөц СЭРГЭЭХ (§7.1) + хэлбэрээр мөнгө буцаах + audit (§2.7).
   * `items` (мөр+тоо) байвал тухайн тоо хэмжээ нөөцөд буцаж нэмэгдэнэ; хэсэгчилсэн
   * буцаалтад мөр тус бүрийн ҮЛДЭГДЭЛ тоогоор давхар сэргээхийг хорино. Зээлийн мөрийг
   * авлага руу буцаана. Бүх тооцоо нэг transaction дотор атомик (§2.3).
   */
  async refundSale(user: AuthUser, saleId: string, input: RefundSaleInput, ip: string | null) {
    const refund = await this.prisma.$transaction(async (tx) => {
      // Тухайн борлуулалтыг түгжинэ — зэрэгцээ буцаалт per-tender cap / per-item үлдэгдлийг
      // тойрч, бэлэн касс/нөөцийг хоёр дахин гаргахаас сэргийлнэ (§2.3, TOCTOU race хаах).
      await tx.$queryRaw`SELECT id FROM "sale" WHERE id = ${saleId} FOR UPDATE`;
      const sale = await tx.sale.findFirst({
        where: { id: saleId, deletedAt: null },
        include: { payments: true, lines: true },
      });
      if (!sale) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Борлуулалт олдсонгүй' });
      await assertStationAccess(tx, user, sale.stationId);
      if (sale.status === SaleStatus.VOIDED) {
        throw new ConflictException({
          code: 'SALE_VOIDED',
          message: 'Цуцлагдсан борлуулалтыг буцаах боломжгүй',
        });
      }

      // Хэлбэр бүрээр ХЭДИЙГ төлсөн (split-safe) ба ӨМНӨ хэдийг буцаасныг гаргана.
      const paidByMethod = new Map<PaymentMethod, bigint>();
      for (const p of sale.payments) {
        paidByMethod.set(p.method, (paidByMethod.get(p.method) ?? 0n) + p.amountMnt);
      }
      const priorLines = await tx.refundLine.findMany({ where: { refund: { saleId: sale.id } } });
      const refundedByMethod = new Map<PaymentMethod, bigint>();
      for (const l of priorLines) {
        refundedByMethod.set(l.method, (refundedByMethod.get(l.method) ?? 0n) + l.amountMnt);
      }

      // Хэлбэр бүрийн буцаалт нь тухайн хэлбэрээр ТӨЛСӨН дүнгээс хэтрэхгүй (§7.3).
      for (const line of input.tenders) {
        const paid = paidByMethod.get(line.method) ?? 0n;
        const already = refundedByMethod.get(line.method) ?? 0n;
        if (already + line.amount > paid) {
          throw new BadRequestException({
            code: 'REFUND_EXCEEDS_TENDER',
            message: `"${PAYMENT_METHOD_LABEL[line.method]}" хэлбэрээр төлсөн дүнгээс их буцааж болохгүй`,
          });
        }
      }
      const tenderTotal = input.tenders.reduce((s, l) => s + l.amount, 0n);

      // ── Мөр (бараа/түлш) буцаалт: нөөц сэргээх дүн + тоог бэлдэх ──
      const lineById = new Map(sale.lines.map((l) => [l.id, l]));
      // Мөр тус бүрийн өмнө буцаасан тоо хэмжээ (milli) — үлдэгдэл тооцоход.
      const priorItems = await tx.refundItem.findMany({ where: { refund: { saleId: sale.id } } });
      const refundedQtyMilli = new Map<string, bigint>();
      const refundedVatMnt = new Map<string, bigint>();
      for (const it of priorItems) {
        refundedQtyMilli.set(
          it.saleLineId,
          (refundedQtyMilli.get(it.saleLineId) ?? 0n) + toMilliUnits(it.quantity.toString()),
        );
        refundedVatMnt.set(it.saleLineId, (refundedVatMnt.get(it.saleLineId) ?? 0n) + it.vatMnt);
      }

      const preparedItems: {
        saleLineId: string;
        type: SaleItemType;
        productId: string | null;
        fuelGradeId: string | null;
        nozzleId: string | null;
        qtyMilli: bigint;
        amountMnt: bigint;
        vatMnt: bigint;
      }[] = [];
      let itemsTotal = 0n;
      for (const item of input.items) {
        const line = lineById.get(item.saleLineId);
        if (!line) {
          throw new BadRequestException({
            code: 'REFUND_LINE_NOT_FOUND',
            message: 'Буцаах мөр энэ борлуулалтад олдсонгүй',
          });
        }
        const reqMilli = toMilliUnits(item.quantity);
        const soldMilli = toMilliUnits(line.quantity.toString());
        const alreadyMilli = refundedQtyMilli.get(line.id) ?? 0n;
        if (reqMilli <= 0n) {
          throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'Тоо хэмжээ 0-ээс их байх ёстой' });
        }
        if (alreadyMilli + reqMilli > soldMilli) {
          throw new BadRequestException({
            code: 'REFUND_EXCEEDS_QTY',
            message: `"${line.description}" мөрийн үлдэгдлээс их буцааж болохгүй`,
          });
        }
        // Мөрийн буцаалтын дүн = нэгж үнэ × тоо (борлуулалттай ижил томьёо).
        const amount = lineTotalMnt(line.unitPriceMnt, reqMilli);
        // НӨАТ-ыг мөрийн НӨАТ-аас тоо хэмжээгээр пропорциональ хуваана (vatable бус мөрд 0).
        // Хэсэгчилсэн буцаалтын round-up хуримтлал нь мөрийн НӨАТ-аас ХЭТРЭХГҮЙ: үлдэгдлээр
        // таслаж, сүүлийн (бүх тоо хэмжээг дуусгах) буцаалтад яг үлдэгдлийг хуваарилна.
        const priorVat = refundedVatMnt.get(line.id) ?? 0n;
        const remainingVat = line.vatMnt - priorVat;
        const isFinalQty = alreadyMilli + reqMilli === soldMilli;
        const proportionalVat = soldMilli > 0n ? divRoundHalfUp(line.vatMnt * reqMilli, soldMilli) : 0n;
        const vat = isFinalQty
          ? remainingVat
          : proportionalVat > remainingVat
            ? remainingVat
            : proportionalVat;
        preparedItems.push({
          saleLineId: line.id,
          type: line.type,
          productId: line.productId,
          fuelGradeId: line.fuelGradeId,
          nozzleId: line.nozzleId,
          qtyMilli: reqMilli,
          amountMnt: amount,
          vatMnt: vat,
        });
        itemsTotal += amount;
      }

      // items байвал буцаасан мөнгө = буцаасан барааны дүн (тэнцэх ёстой).
      if (preparedItems.length > 0 && tenderTotal !== itemsTotal) {
        throw new BadRequestException({
          code: 'REFUND_AMOUNT_MISMATCH',
          message: 'Буцаах төлбөрийн нийлбэр буцаах барааны дүнтэй тэнцэх ёстой',
        });
      }

      // Буцаалт бүр нээлттэй ээлжид хамаарна — ингэснээр хэлбэр бүрийн буцаалт (бэлэн ч,
      // карт/мобайл ч) тухайн ээлжийн тооцооноос (expectedByMethod) зөв хасагдана. Эс бөгөөс
      // shiftId=null болж аль ч ээлжид тусахгүй "өнчин" буцаалт үүснэ (§7.3 тооцоо нийлэлт).
      const openShift = await tx.shift.findFirst({
        where: { stationId: sale.stationId, status: 'OPEN' },
      });
      if (!openShift) {
        throw new BadRequestException({
          code: 'SHIFT_NOT_OPEN',
          message: 'Буцаалт хийхэд нээлттэй ээлж шаардлагатай',
        });
      }

      // Зээлийн мөр бол харилцагчийн авлагыг бууруулна (бэлэн гарахгүй §7.3).
      const creditLine = input.tenders.find((l) => l.method === PaymentMethod.CREDIT);
      if (creditLine) {
        if (!sale.customerId) {
          throw new BadRequestException({
            code: 'CUSTOMER_REQUIRED',
            message: 'Зээлийн буцаалтад харилцагч шаардлагатай',
          });
        }
        const { remaining } = await this.customers.creditReversibleForSale(tx, sale.id);
        if (creditLine.amount > remaining) {
          throw new BadRequestException({
            code: 'REFUND_EXCEEDS_CREDIT',
            message: 'Буцаах дүн үлдэгдэл зээлээс их байж болохгүй',
          });
        }
        await this.customers.reverseCreditInTx(tx, {
          customerId: sale.customerId,
          companyId: user.companyId,
          amountMnt: creditLine.amount,
          saleId: sale.id,
          stationId: sale.stationId,
          actorId: user.sub,
          reason: `Буцаалт: ${input.reason}`,
        });
      }

      // Нөөц сэргээх савыг урьдчилан тогтооно (мөр тус бүрд).
      const created = await tx.refund.create({
        data: {
          saleId: sale.id,
          stationId: sale.stationId,
          shiftId: openShift.id,
          amountMnt: tenderTotal,
          reason: input.reason,
          actorId: user.sub,
          lines: { create: input.tenders.map((l) => ({ method: l.method, amountMnt: l.amount })) },
        },
        include: { lines: true },
      });

      // Мөр бүрийн нөөцийг буцааж нэмэх + RefundItem ledger.
      for (const it of preparedItems) {
        const tankId = await this.restoreItemStock(tx, sale.stationId, sale.id, created.id, user.sub, it, input.reason);
        await tx.refundItem.create({
          data: {
            refundId: created.id,
            saleLineId: it.saleLineId,
            type: it.type,
            productId: it.productId,
            fuelTankId: tankId,
            fuelGradeId: it.fuelGradeId,
            quantity: milliToDecimalString(it.qtyMilli),
            amountMnt: it.amountMnt,
            vatMnt: it.vatMnt,
          },
        });
      }

      // Бүх хэлбэрийн нийт буцаалт борлуулалтын дүнд хүрсэн үед л REFUNDED.
      const priorTotal = priorLines.reduce((s, l) => s + l.amountMnt, 0n);
      if (priorTotal + tenderTotal >= sale.totalMnt) {
        await tx.sale.update({ where: { id: sale.id }, data: { status: SaleStatus.REFUNDED } });
      }
      const full = await tx.refund.findUnique({ where: { id: created.id }, include: { lines: true, items: true } });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.REFUND,
          entity: 'Sale',
          entityId: sale.id,
          after: full,
          stationId: sale.stationId,
          ip,
        },
        tx,
      );
      return full;
    });

    // Realtime — нөөц/борлуулалт өөрчлөгдсөнийг самбарт мэдэгдэнэ (commit-ийн дараа).
    if (refund) {
      this.realtime.emitToStation(user.companyId, refund.stationId, RealtimeEvent.SALE_CREATED, {
        saleId: refund.saleId,
        stationId: refund.stationId,
        totalMnt: (-refund.amountMnt).toString(),
        soldAt: refund.createdAt.toISOString(),
        cashierId: user.employeeId,
      });
    }
    return refund;
  }

  /** Буцаалтын мөрөөр нөөцийг буцааж нэмэх + reversing StockMovement (refType='refund'). */
  private async restoreItemStock(
    tx: Prisma.TransactionClient,
    stationId: string,
    saleId: string,
    refundId: string,
    actorId: string,
    item: { type: SaleItemType; productId: string | null; fuelGradeId: string | null; nozzleId: string | null; qtyMilli: bigint },
    reason: string,
  ): Promise<string | null> {
    const qtyDec = milliToDecimalString(item.qtyMilli);
    if (item.type === SaleItemType.FUEL) {
      let tankId: string | null = null;
      // 1) Тоолуур заасан бол түүний сав деттерминист.
      if (item.nozzleId) {
        const nozzle = await tx.nozzle.findFirst({ where: { id: item.nozzleId, tank: { stationId } } });
        tankId = nozzle?.tankId ?? null;
      }
      // 2) Тоолуургүй бол ЭХ борлуулалтын ledger-т бичигдсэн (грейд таарсан) савыг ашиглана —
      //    борлуулалтаас хойш идэвхтэй сав солигдсон ч ЗӨВ саванд буцаана (void-той ижил эх сурвалж, §7.2).
      if (!tankId && item.fuelGradeId) {
        const saleMoves = await tx.stockMovement.findMany({
          where: { refType: 'sale', refId: saleId, fuelTankId: { not: null } },
          select: { fuelTankId: true },
        });
        const candidateIds = saleMoves.map((m) => m.fuelTankId as string);
        if (candidateIds.length > 0) {
          const tank = await tx.fuelTank.findFirst({
            where: { id: { in: candidateIds }, fuelGradeId: item.fuelGradeId },
            select: { id: true },
          });
          tankId = tank?.id ?? null;
        }
      }
      // 3) Fallback: грейдийн идэвхтэй сав (ledger-гүй хуучин мөр).
      if (!tankId && item.fuelGradeId) {
        const tank = await tx.fuelTank.findFirst({
          where: { stationId, fuelGradeId: item.fuelGradeId, deletedAt: null },
          orderBy: { isActive: 'desc' },
        });
        tankId = tank?.id ?? null;
      }
      if (!tankId) {
        throw new BadRequestException({ code: 'TANK_NOT_FOUND', message: 'Түлш буцаах сав олдсонгүй' });
      }
      await tx.fuelTank.update({ where: { id: tankId }, data: { currentLiters: { increment: new Prisma.Decimal(qtyDec) } } });
      await tx.stockMovement.create({
        data: {
          stationId,
          type: StockMovementType.ADJUSTMENT,
          fuelTankId: tankId,
          quantity: new Prisma.Decimal(qtyDec),
          reason: `Буцаалт: ${reason}`,
          refType: 'refund',
          refId: refundId,
          actorId,
        },
      });
      return tankId;
    }
    if (item.type === SaleItemType.PRODUCT && item.productId) {
      await tx.stockLevel.upsert({
        where: { stationId_productId: { stationId, productId: item.productId } },
        update: { quantity: { increment: new Prisma.Decimal(qtyDec) } },
        create: { stationId, productId: item.productId, quantity: new Prisma.Decimal(qtyDec) },
      });
      await tx.stockMovement.create({
        data: {
          stationId,
          type: StockMovementType.ADJUSTMENT,
          productId: item.productId,
          quantity: new Prisma.Decimal(qtyDec),
          reason: `Буцаалт: ${reason}`,
          refType: 'refund',
          refId: refundId,
          actorId,
        },
      });
    }
    return null;
  }

  /** Хандах эрхтэй салбарууд — DB-гээс баталгаажуулна (§10). */
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

  /** Борлуулалтын түүх — шүүлттэй (огноо, кассчин, харилцагч, хэлбэр, грейд/бараа). */
  async listSales(user: AuthUser, q: SalesListQuery) {
    let stationIds: string[];
    if (q.stationId) {
      await assertStationAccess(this.prisma, user, q.stationId);
      stationIds = [q.stationId];
    } else {
      stationIds = await this.accessibleStationIds(user);
    }

    const where: Prisma.SaleWhereInput = { stationId: { in: stationIds }, deletedAt: null };
    if (q.from || q.to) {
      where.soldAt = {};
      if (q.from) where.soldAt.gte = new Date(`${q.from}T00:00:00+08:00`);
      if (q.to) where.soldAt.lt = new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
    }
    if (q.cashierId) where.cashierId = q.cashierId;
    if (q.customerId) where.customerId = q.customerId;
    if (q.status) where.status = q.status;
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

    const [rows, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { ...saleInclude, refunds: { select: { amountMnt: true } } },
        orderBy: { soldAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);

    const names = await this.resolveNames(rows);
    const items = rows.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      stationId: s.stationId,
      stationLabel: names.station.get(s.stationId) ?? null,
      soldAt: s.soldAt,
      status: s.status,
      cashierId: s.cashierId,
      cashierName: names.cashier.get(s.cashierId) ?? null,
      customerId: s.customerId,
      customerName: s.customerId ? (names.customer.get(s.customerId) ?? null) : null,
      subtotalMnt: s.subtotalMnt,
      vatMnt: s.vatMnt,
      totalMnt: s.totalMnt,
      refundedMnt: s.refunds.reduce((sum, r) => sum + r.amountMnt, 0n),
      methods: s.payments.map((p) => ({ method: p.method, amountMnt: p.amountMnt })),
      lineCount: s.lines.length,
    }));
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  }

  /** Борлуулалтын дэлгэрэнгүй — мөр, төлбөр, буцаалт + кассчин/харилцагч нэр. */
  async getSale(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, deletedAt: null },
      include: {
        lines: { include: { product: { select: { unit: true } } } },
        payments: true,
        refunds: { include: { lines: true, items: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Борлуулалт олдсонгүй' });
    await assertStationAccess(this.prisma, user, sale.stationId);
    const names = await this.resolveNames([sale]);
    // Мөр тус бүрийн өмнө буцаасан тоо хэмжээ — UI-д үлдэгдлийг харуулахад.
    const refundedQty = new Map<string, bigint>();
    for (const r of sale.refunds) {
      for (const it of r.items) {
        refundedQty.set(it.saleLineId, (refundedQty.get(it.saleLineId) ?? 0n) + toMilliUnits(it.quantity.toString()));
      }
    }
    return {
      ...sale,
      cashierName: names.cashier.get(sale.cashierId) ?? null,
      stationLabel: names.station.get(sale.stationId) ?? null,
      customerName: sale.customerId ? (names.customer.get(sale.customerId) ?? null) : null,
      lines: sale.lines.map(({ product, ...l }) => ({
        ...l,
        unit: product?.unit ?? null, // барааны нэгж (ш, кг...) — түлшний хувьд UI-д 'л'
        refundedQty: milliToDecimalString(refundedQty.get(l.id) ?? 0n),
      })),
    };
  }

  /** Борлуулалтуудын кассчин/харилцагч/салбарын нэрийг багцлан шийднэ (N+1 хорино). */
  private async resolveNames(sales: { cashierId: string; customerId: string | null; stationId: string }[]) {
    const cashierIds = [...new Set(sales.map((s) => s.cashierId))];
    const customerIds = [...new Set(sales.map((s) => s.customerId).filter((x): x is string => !!x))];
    const stationIds = [...new Set(sales.map((s) => s.stationId))];
    const [emps, custs, stations] = await Promise.all([
      cashierIds.length
        ? this.prisma.employee.findMany({ where: { id: { in: cashierIds } }, select: { id: true, firstName: true, lastName: true } })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      this.prisma.station.findMany({ where: { id: { in: stationIds } }, select: { id: true, code: true, name: true } }),
    ]);
    return {
      cashier: new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()])),
      customer: new Map(custs.map((c) => [c.id, c.name])),
      station: new Map(stations.map((s) => [s.id, `${s.code} — ${s.name}`])),
    };
  }

  /** POS дэлгэцэд: салбарын идэвхтэй түлшний үнэ + борлуулах бараа. */
  async catalog(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const [grades, products, prices] = await Promise.all([
      this.prisma.fuelGrade.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, isActive: true },
        include: { group: { select: { name: true, sortOrder: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.fuelPrice.findMany({
        where: { stationId, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    const priceByGrade = new Map<string, bigint>();
    for (const p of prices) {
      if (!priceByGrade.has(p.fuelGradeId)) priceByGrade.set(p.fuelGradeId, p.pricePerLiterMnt);
    }

    return {
      fuels: grades
        .filter((g) => priceByGrade.has(g.id))
        .map((g) => ({
          fuelGradeId: g.id,
          code: g.code,
          name: g.name,
          pricePerLiterMnt: priceByGrade.get(g.id) as bigint,
        })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        // Бараа материалын бүлэг — group.name давуу, эс бөгөөс legacy category (default "Бусад")
        category: p.group?.name ?? p.category ?? 'Бусад',
        priceMnt: p.priceMnt,
        isVatable: p.isVatable,
      })),
    };
  }
}
