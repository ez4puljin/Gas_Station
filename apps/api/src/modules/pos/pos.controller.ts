import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type CreateSaleInput,
  createSaleSchema,
  type RefundSaleInput,
  refundSaleSchema,
  type SalesListQuery,
  salesListQuerySchema,
  stationIdSchema,
  type VoidSaleInput,
  voidSaleSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PosService } from './pos.service';

const stationQuerySchema = z.object({ stationId: stationIdSchema });
type StationQuery = z.infer<typeof stationQuerySchema>;

@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  /** POS дэлгэцийн каталог (түлшний үнэ + бараа) */
  @Get('catalog')
  catalog(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stationQuerySchema)) query: StationQuery,
  ) {
    return this.pos.catalog(user, query.stationId);
  }

  @Post('sales')
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER)
  // Audit-ийг service дотор transaction-той бичдэг тул @Audit давхардуулахгүй
  createSale(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSaleSchema)) dto: CreateSaleInput,
    @Ip() ip: string,
  ) {
    return this.pos.createSale(user, dto, ip ?? null);
  }

  @Get('sales')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(salesListQuerySchema)) query: SalesListQuery,
  ) {
    return this.pos.listSales(user, query);
  }

  @Get('sales/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pos.getSale(user, id);
  }

  @Post('sales/:id/void')
  @Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  voidSale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidSaleSchema)) dto: VoidSaleInput,
    @Ip() ip: string,
  ) {
    return this.pos.voidSale(user, id, dto, ip ?? null);
  }

  @Post('sales/:id/refund')
  @Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  refundSale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(refundSaleSchema)) dto: RefundSaleInput,
    @Ip() ip: string,
  ) {
    return this.pos.refundSale(user, id, dto, ip ?? null);
  }
}
