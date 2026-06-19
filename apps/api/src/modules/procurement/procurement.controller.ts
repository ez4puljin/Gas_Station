import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreatePurchaseInput,
  createPurchaseSchema,
  type CreateSupplierInput,
  createSupplierSchema,
  type LedgerQuery,
  ledgerQuerySchema,
  paginationSchema,
  type PurchaseListQuery,
  purchaseListQuerySchema,
  type ReceivePurchaseLineInput,
  receivePurchaseLineSchema,
  type SupplierAdjustmentInput,
  supplierAdjustmentSchema,
  type SupplierPaymentInput,
  supplierPaymentSchema,
  type UpdateSupplierInput,
  updateSupplierSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProcurementService } from './procurement.service';

@Controller()
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  // ── Нийлүүлэгч (Supplier) + өглөг (AP) ──
  @Get('suppliers')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  listSuppliers(@CurrentUser() user: AuthUser) {
    return this.procurement.listSuppliers(user);
  }

  // '/payables' нь '/:id'-ээс ӨМНӨ
  @Get('suppliers/payables')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  payables(@CurrentUser() user: AuthUser) {
    return this.procurement.payables(user);
  }

  @Get('suppliers/:id')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  getSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.procurement.getSupplier(user, id);
  }

  @Get('suppliers/:id/transactions')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  transactions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(paginationSchema)) q: { page: number; pageSize: number },
  ) {
    return this.procurement.transactions(user, id, q.page, q.pageSize);
  }

  @Get('suppliers/:id/ledger')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ledgerQuerySchema)) q: LedgerQuery,
  ) {
    return this.procurement.ledger(user, id, q.from, q.to);
  }

  @Post('suppliers')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSupplierSchema)) dto: CreateSupplierInput,
    @Ip() ip: string,
  ) {
    return this.procurement.createSupplier(user, dto, ip ?? null);
  }

  @Patch('suppliers/:id')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  updateSupplier(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupplierSchema)) dto: UpdateSupplierInput,
    @Ip() ip: string,
  ) {
    return this.procurement.updateSupplier(user, id, dto, ip ?? null);
  }

  @Delete('suppliers/:id')
  @Roles(RoleKey.ACCOUNTANT)
  deleteSupplier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.procurement.deleteSupplier(user, id, ip ?? null);
  }

  @Post('suppliers/:id/payments')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supplierPaymentSchema)) dto: SupplierPaymentInput,
    @Ip() ip: string,
  ) {
    return this.procurement.recordPayment(user, id, dto, ip ?? null);
  }

  @Post('suppliers/:id/adjustments')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supplierAdjustmentSchema)) dto: SupplierAdjustmentInput,
    @Ip() ip: string,
  ) {
    return this.procurement.adjust(user, id, dto, ip ?? null);
  }

  // ── Худалдан авалт (Purchase) ──
  @Get('purchases')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  listPurchases(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(purchaseListQuerySchema)) q: PurchaseListQuery,
  ) {
    return this.procurement.listPurchases(user, q);
  }

  @Get('purchases/:id')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  getPurchase(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.procurement.getPurchase(user, id);
  }

  @Post('purchases')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  createPurchase(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPurchaseSchema)) dto: CreatePurchaseInput,
    @Ip() ip: string,
  ) {
    return this.procurement.createPurchase(user, dto, ip ?? null);
  }

  @Post('purchases/:purchaseId/lines/:lineId/receive')
  @Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  receiveLine(
    @CurrentUser() user: AuthUser,
    @Param('purchaseId') purchaseId: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(receivePurchaseLineSchema)) dto: ReceivePurchaseLineInput,
    @Ip() ip: string,
  ) {
    return this.procurement.receiveLine(user, purchaseId, lineId, dto, ip ?? null);
  }

  @Post('purchases/:purchaseId/lines/:lineId/cancel')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  cancelLine(
    @CurrentUser() user: AuthUser,
    @Param('purchaseId') purchaseId: string,
    @Param('lineId') lineId: string,
    @Ip() ip: string,
  ) {
    return this.procurement.cancelLine(user, purchaseId, lineId, ip ?? null);
  }
}
