import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type CreateProductGroupInput,
  createProductGroupSchema,
  type CreateProductInput,
  createProductSchema,
  type CreateSupplierInput,
  createSupplierSchema,
  type DeliveryReportQuery,
  deliveryReportQuerySchema,
  type FuelDeliveryInput,
  fuelDeliverySchema,
  type FuelReconQuery,
  fuelReconQuerySchema,
  type MovementReportQuery,
  movementReportQuerySchema,
  paginationSchema,
  type SetReorderLevelInput,
  setReorderLevelSchema,
  type StockAdjustmentInput,
  stockAdjustmentSchema,
  type StockTransferInput,
  stockTransferSchema,
  stationIdSchema,
  type TankReadingInput,
  tankReadingSchema,
  type UpdateProductGroupInput,
  updateProductGroupSchema,
  type UpdateProductInput,
  updateProductSchema,
  type ValuationQuery,
  valuationQuerySchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InventoryService } from './inventory.service';

const stationQuerySchema = z.object({ stationId: stationIdSchema });
type StationQuery = z.infer<typeof stationQuerySchema>;

const movementsQuerySchema = paginationSchema.extend({ stationId: stationIdSchema });
type MovementsQuery = z.infer<typeof movementsQuerySchema>;

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // ── Бараа ──
  @Get('products')
  listProducts(@CurrentUser() user: AuthUser) {
    return this.inventory.listProducts(user);
  }

  @Post('products')
  @Roles(RoleKey.STATION_MANAGER)
  createProduct(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductInput,
    @Ip() ip: string,
  ) {
    return this.inventory.createProduct(user, dto, ip ?? null);
  }

  @Patch('products/:id')
  @Roles(RoleKey.STATION_MANAGER)
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductInput,
    @Ip() ip: string,
  ) {
    return this.inventory.updateProduct(user, id, dto, ip ?? null);
  }

  @Delete('products/:id')
  @Roles(RoleKey.STATION_MANAGER)
  deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.inventory.deleteProduct(user, id, ip ?? null);
  }

  // ── Барааны бүлэг ──
  @Get('product-groups')
  listProductGroups(@CurrentUser() user: AuthUser) {
    return this.inventory.listProductGroups(user);
  }

  @Post('product-groups')
  @Roles(RoleKey.STATION_MANAGER)
  createProductGroup(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductGroupSchema)) dto: CreateProductGroupInput,
    @Ip() ip: string,
  ) {
    return this.inventory.createProductGroup(user, dto, ip ?? null);
  }

  @Patch('product-groups/:id')
  @Roles(RoleKey.STATION_MANAGER)
  updateProductGroup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductGroupSchema)) dto: UpdateProductGroupInput,
    @Ip() ip: string,
  ) {
    return this.inventory.updateProductGroup(user, id, dto, ip ?? null);
  }

  @Delete('product-groups/:id')
  @Roles(RoleKey.STATION_MANAGER)
  deleteProductGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.inventory.deleteProductGroup(user, id, ip ?? null);
  }

  // ── Нийлүүлэгч ──
  @Get('suppliers')
  listSuppliers(@CurrentUser() user: AuthUser) {
    return this.inventory.listSuppliers(user);
  }

  @Post('suppliers')
  @Roles(RoleKey.STATION_MANAGER)
  createSupplier(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSupplierSchema)) dto: CreateSupplierInput,
    @Ip() ip: string,
  ) {
    return this.inventory.createSupplier(user, dto, ip ?? null);
  }

  // ── Төлөв / alert / ledger ──
  @Get('stock')
  stock(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stationQuerySchema)) q: StationQuery,
  ) {
    return this.inventory.stockOverview(user, q.stationId);
  }

  @Get('alerts')
  alerts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stationQuerySchema)) q: StationQuery,
  ) {
    return this.inventory.lowStockAlerts(user, q.stationId);
  }

  @Get('movements')
  movements(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(movementsQuerySchema)) q: MovementsQuery,
  ) {
    return this.inventory.listMovements(user, q.stationId, q.page, q.pageSize);
  }

  // ── Тайлангууд ──
  @Get('reports/deliveries')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  deliveriesReport(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(deliveryReportQuerySchema)) q: DeliveryReportQuery,
  ) {
    return this.inventory.deliveriesReport(user, q);
  }

  @Get('reports/valuation')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  valuation(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(valuationQuerySchema)) q: ValuationQuery,
  ) {
    return this.inventory.valuation(user, q.stationId);
  }

  @Get('reports/movements')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  movementReport(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(movementReportQuerySchema)) q: MovementReportQuery,
  ) {
    return this.inventory.movementReport(user, q);
  }

  @Get('reports/fuel-recon')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  fuelRecon(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(fuelReconQuerySchema)) q: FuelReconQuery,
  ) {
    return this.inventory.fuelReconciliation(user, q);
  }

  // ── Үйлдлүүд (transaction + audit) ──
  @Post('adjustments')
  @Roles(RoleKey.STATION_MANAGER)
  adjust(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(stockAdjustmentSchema)) dto: StockAdjustmentInput,
    @Ip() ip: string,
  ) {
    return this.inventory.adjustStock(user, dto, ip ?? null);
  }

  @Post('deliveries')
  @Roles(RoleKey.STATION_MANAGER)
  receiveDelivery(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(fuelDeliverySchema)) dto: FuelDeliveryInput,
    @Ip() ip: string,
  ) {
    return this.inventory.receiveDelivery(user, dto, ip ?? null);
  }

  @Post('tank-readings')
  @Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER)
  tankReading(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tankReadingSchema)) dto: TankReadingInput,
    @Ip() ip: string,
  ) {
    return this.inventory.recordTankReading(user, dto, ip ?? null);
  }

  @Post('reorder-level')
  @Roles(RoleKey.STATION_MANAGER)
  setReorderLevel(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setReorderLevelSchema)) dto: SetReorderLevelInput,
    @Ip() ip: string,
  ) {
    return this.inventory.setReorderLevel(user, dto, ip ?? null);
  }

  @Post('transfers')
  @Roles(RoleKey.STATION_MANAGER)
  transfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(stockTransferSchema)) dto: StockTransferInput,
    @Ip() ip: string,
  ) {
    return this.inventory.transferStock(user, dto, ip ?? null);
  }
}
