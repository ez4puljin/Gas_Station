import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateCustomerInput,
  CustomerAdjustmentInput,
  CustomerPaymentInput,
  UpdateCustomerInput,
} from '@fuel/schemas';
import { AuditAction, type AuthUser, CustomerTxnType } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { AuditService } from '../audit/audit.service';

/**
 * Харилцагч ба авлага/өглөг — компани-хэмжээнд (§10). Бүх балансын өөрчлөлт
 * transaction + FOR UPDATE row-lock-той (concurrency-д зөв) + CustomerTransaction
 * subledger + audit (§2.3, §8). balanceMnt: + = авлага, - = өглөг.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Балансын мутацын өмнө мөрийг түгжиж, компани-scope-той уншина. */
  private async lockCustomer(
    tx: Prisma.TransactionClient,
    id: string,
    companyId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "customer" WHERE id = ${id} FOR UPDATE`;
    const customer = await tx.customer.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Харилцагч олдсонгүй' });
    }
    return customer;
  }

  list(user: AuthUser, search?: string) {
    return this.prisma.customer.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Харилцагч олдсонгүй' });
    }
    return customer;
  }

  async create(user: AuthUser, input: CreateCustomerInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          companyId: user.companyId,
          name: input.name,
          code: input.code ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          regNo: input.regNo ?? null,
          address: input.address ?? null,
          creditLimitMnt: input.creditLimitMnt ?? 0n,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.CREATE, entity: 'Customer', entityId: customer.id, after: customer, ip },
        tx,
      );
      return customer;
    });
  }

  async update(user: AuthUser, id: string, input: UpdateCustomerInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.customer.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
      if (!before) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Харилцагч олдсонгүй' });
      const customer = await tx.customer.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          code: input.code ?? undefined,
          phone: input.phone ?? undefined,
          email: input.email ?? undefined,
          regNo: input.regNo ?? undefined,
          address: input.address ?? undefined,
          creditLimitMnt: input.creditLimitMnt ?? undefined,
          isActive: input.isActive ?? undefined,
        },
      });
      await this.audit.record(
        { actorId: user.sub, action: AuditAction.UPDATE, entity: 'Customer', entityId: id, before, after: customer, ip },
        tx,
      );
      return customer;
    });
  }

  /**
   * Зээлийн борлуулалтын авлага нэмэх — POS-ийн sale transaction ДОТРООС дуудна (атомик).
   * Идэвхтэй харилцагч + лимит шалгана.
   */
  async chargeCreditInTx(
    tx: Prisma.TransactionClient,
    params: {
      customerId: string;
      companyId: string;
      amountMnt: bigint;
      saleId: string;
      stationId: string;
      actorId: string;
    },
  ): Promise<void> {
    const customer = await this.lockCustomer(tx, params.customerId, params.companyId);
    if (!customer.isActive) {
      throw new BadRequestException({ code: 'CUSTOMER_INACTIVE', message: 'Харилцагч идэвхгүй байна' });
    }
    const newBalance = customer.balanceMnt + params.amountMnt;
    if (customer.creditLimitMnt > 0n && newBalance > customer.creditLimitMnt) {
      throw new BadRequestException({
        code: 'CREDIT_LIMIT_EXCEEDED',
        message: 'Зээлийн лимит хэтэрлээ',
      });
    }
    await tx.customer.update({ where: { id: customer.id }, data: { balanceMnt: newBalance } });
    await tx.customerTransaction.create({
      data: {
        customerId: customer.id,
        stationId: params.stationId,
        type: CustomerTxnType.CREDIT_SALE,
        amountMnt: params.amountMnt,
        balanceAfterMnt: newBalance,
        saleId: params.saleId,
        actorId: params.actorId,
      },
    });
  }

  /**
   * Зээлийн авлагыг буцаах — POS-ийн void/refund transaction ДОТРООС дуудна (атомик).
   * amountMnt: буцаах эерэг дүн → балансыг бууруулна.
   */
  async reverseCreditInTx(
    tx: Prisma.TransactionClient,
    params: {
      customerId: string;
      companyId: string;
      amountMnt: bigint;
      saleId: string;
      stationId: string | null;
      actorId: string;
      reason: string;
    },
  ): Promise<void> {
    if (params.amountMnt <= 0n) return;
    const customer = await this.lockCustomer(tx, params.customerId, params.companyId);
    const newBalance = customer.balanceMnt - params.amountMnt;
    await tx.customer.update({ where: { id: customer.id }, data: { balanceMnt: newBalance } });
    await tx.customerTransaction.create({
      data: {
        customerId: customer.id,
        stationId: params.stationId,
        type: CustomerTxnType.ADJUSTMENT, // saleId-тэй ADJUSTMENT = зээлийн буцаалт
        amountMnt: -params.amountMnt,
        balanceAfterMnt: newBalance,
        saleId: params.saleId,
        reason: params.reason,
        actorId: params.actorId,
      },
    });
  }

  /** Тухайн борлуулалтын буцаах боломжтой үлдэгдэл зээл (charge − өмнө буцаасан). */
  async creditReversibleForSale(
    tx: Prisma.TransactionClient,
    saleId: string,
  ): Promise<{ customerId: string | null; remaining: bigint }> {
    const charge = await tx.customerTransaction.findFirst({
      where: { saleId, type: CustomerTxnType.CREDIT_SALE },
    });
    if (!charge) return { customerId: null, remaining: 0n };
    // saleId-тэй ADJUSTMENT-ууд = өмнө хийсэн буцаалт (сөрөг дүнтэй)
    const agg = await tx.customerTransaction.aggregate({
      where: { saleId, type: CustomerTxnType.ADJUSTMENT },
      _sum: { amountMnt: true },
    });
    const alreadyReversed = -(agg._sum.amountMnt ?? 0n);
    const remaining = charge.amountMnt - alreadyReversed;
    return { customerId: charge.customerId, remaining: remaining > 0n ? remaining : 0n };
  }

  /** Авлага барагдуулах төлбөр — балансыг бууруулна (§8 audit). */
  async recordPayment(user: AuthUser, id: string, input: CustomerPaymentInput, ip: string | null) {
    return this.prisma.$transaction(async (tx) => {
      // stationId өгсөн бол хандах эрх + company-г шалгана (§10)
      if (input.stationId) {
        await assertStationAccess(tx, user, input.stationId);
      }
      const customer = await this.lockCustomer(tx, id, user.companyId);
      const delta = -input.amount; // төлбөр → авлага хорогдоно
      const newBalance = customer.balanceMnt + delta;
      await tx.customer.update({ where: { id: customer.id }, data: { balanceMnt: newBalance } });
      const txn = await tx.customerTransaction.create({
        data: {
          customerId: customer.id,
          stationId: input.stationId ?? null,
          type: CustomerTxnType.PAYMENT,
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
          action: AuditAction.CUSTOMER_PAYMENT,
          entity: 'Customer',
          entityId: customer.id,
          before: { balanceMnt: customer.balanceMnt },
          after: { balanceMnt: newBalance, txn },
          stationId: input.stationId ?? null,
          ip,
        },
        tx,
      );
      return { customerId: customer.id, balanceMnt: newBalance, transaction: txn };
    });
  }

  /** Гар засвар — тэмдэгтэй дүн, reason заавал (§2.7), audit (§8). */
  async adjust(user: AuthUser, id: string, input: CustomerAdjustmentInput, ip: string | null) {
    if (input.amountMnt === 0n) {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Засварын дүн 0 байж болохгүй' });
    }
    return this.prisma.$transaction(async (tx) => {
      const customer = await this.lockCustomer(tx, id, user.companyId);
      const newBalance = customer.balanceMnt + input.amountMnt;
      await tx.customer.update({ where: { id: customer.id }, data: { balanceMnt: newBalance } });
      const txn = await tx.customerTransaction.create({
        data: {
          customerId: customer.id,
          type: CustomerTxnType.ADJUSTMENT,
          amountMnt: input.amountMnt,
          balanceAfterMnt: newBalance,
          reason: input.reason,
          actorId: user.sub,
        },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          action: AuditAction.CUSTOMER_ADJUST,
          entity: 'Customer',
          entityId: customer.id,
          before: { balanceMnt: customer.balanceMnt },
          after: { balanceMnt: newBalance, txn },
          ip,
        },
        tx,
      );
      return { customerId: customer.id, balanceMnt: newBalance, transaction: txn };
    });
  }

  /** Харилцагчийн тооцооны хуулга (subledger). */
  async transactions(user: AuthUser, id: string, page: number, pageSize: number) {
    await this.get(user, id); // company-scope шалгана
    const where: Prisma.CustomerTransactionWhereInput = { customerId: id };
    const [items, total] = await Promise.all([
      this.prisma.customerTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerTransaction.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Авлага-өглөгийн дэвтэр (ledger) — нэг харилцагч, огнооны муж (§7.4).
   * Эхний үлдэгдэл = мужийн өмнөх сүүлчийн гүйлгээний balanceAfterMnt (эс бөгөөс 0).
   * Дебет = авлага нэмэгдсэн (CREDIT_SALE, +ADJUSTMENT); Кредит = барагдсан (PAYMENT, -ADJUSTMENT).
   * Эцсийн = эхний + дебет − кредит.
   */
  async ledger(user: AuthUser, id: string, from: string, to: string) {
    const customer = await this.get(user, id); // company-scope шалгана
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    const start = new Date(`${from}T00:00:00+08:00`);
    const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);

    const [priorTxn, rows] = await Promise.all([
      this.prisma.customerTransaction.findFirst({
        where: { customerId: id, createdAt: { lt: start } },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfterMnt: true },
      }),
      this.prisma.customerTransaction.findMany({
        where: { customerId: id, createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Гүйлгээний борлуулалтын дугаар/огноо + мөр (бараа/түлш)-ийг багцлан шийднэ.
    // Мөрүүд нь тайлангийн гүйлгээ дээр double-click хийхэд харагдах бараа материал.
    const saleIds = [...new Set(rows.map((r) => r.saleId).filter((x): x is string => !!x))];
    const sales = saleIds.length
      ? await this.prisma.sale.findMany({
          where: { id: { in: saleIds } },
          select: {
            id: true,
            saleNumber: true,
            soldAt: true,
            lines: {
              select: {
                type: true,
                description: true,
                quantity: true,
                unitPriceMnt: true,
                lineTotalMnt: true,
                product: { select: { unit: true, sku: true } },
              },
            },
          },
        })
      : [];
    const saleById = new Map(sales.map((s) => [s.id, s]));

    const openingMnt = priorTxn?.balanceAfterMnt ?? 0n;
    let totalDebitMnt = 0n;
    let totalCreditMnt = 0n;
    const entries = rows.map((r) => {
      const debit = r.amountMnt > 0n ? r.amountMnt : 0n;
      const credit = r.amountMnt < 0n ? -r.amountMnt : 0n;
      totalDebitMnt += debit;
      totalCreditMnt += credit;
      const sale = r.saleId ? saleById.get(r.saleId) : null;
      const items = (sale?.lines ?? []).map((l) => ({
        itemType: l.type,
        name: l.description,
        sku: l.product?.sku ?? null,
        quantity: l.quantity.toString(),
        unit: l.product?.unit ?? (l.type === 'FUEL' ? 'л' : ''),
        unitCostMnt: l.unitPriceMnt,
        totalCostMnt: l.lineTotalMnt,
      }));
      return {
        id: r.id,
        createdAt: r.createdAt,
        type: r.type,
        method: r.method,
        reason: r.reason,
        saleId: r.saleId,
        saleNumber: sale?.saleNumber ?? null,
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
      customer: {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        regNo: customer.regNo,
        phone: customer.phone,
      },
      openingMnt,
      totalDebitMnt,
      totalCreditMnt,
      closingMnt,
      entries,
    };
  }

  /** Авлага/өглөгийн нэгдсэн тайлан — admin/accountant (бүх харилцагч). */
  async receivables(user: AuthUser) {
    const customers = await this.prisma.customer.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { balanceMnt: 'desc' },
    });
    let totalReceivableMnt = 0n;
    let totalPayableMnt = 0n;
    for (const c of customers) {
      if (c.balanceMnt > 0n) totalReceivableMnt += c.balanceMnt;
      else if (c.balanceMnt < 0n) totalPayableMnt += -c.balanceMnt;
    }
    return {
      count: customers.length,
      totalReceivableMnt,
      totalPayableMnt,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        creditLimitMnt: c.creditLimitMnt,
        balanceMnt: c.balanceMnt,
        isActive: c.isActive,
      })),
    };
  }
}
