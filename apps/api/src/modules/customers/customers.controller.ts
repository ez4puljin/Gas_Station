import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type CreateCustomerInput,
  createCustomerSchema,
  type CustomerAdjustmentInput,
  customerAdjustmentSchema,
  type CustomerPaymentInput,
  customerPaymentSchema,
  type LedgerQuery,
  ledgerQuerySchema,
  paginationSchema,
  type UpdateCustomerInput,
  updateCustomerSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CustomersService } from './customers.service';

const listQuerySchema = z.object({ search: z.string().optional() });
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery,
  ) {
    return this.customers.list(user, q.search);
  }

  // '/receivables' нь '/:id'-ээс ӨМНӨ
  @Get('receivables')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  receivables(@CurrentUser() user: AuthUser) {
    return this.customers.receivables(user);
  }

  @Get(':id')
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.get(user, id);
  }

  @Get(':id/transactions')
  @Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  transactions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(paginationSchema)) q: { page: number; pageSize: number },
  ) {
    return this.customers.transactions(user, id, q.page, q.pageSize);
  }

  /** Авлага-өглөгийн дэвтэр (огнооны муж) — нягтлан/менежер. */
  @Get(':id/ledger')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ledgerQuerySchema)) q: LedgerQuery,
  ) {
    return this.customers.ledger(user, id, q.from, q.to);
  }

  @Post()
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCustomerSchema)) dto: CreateCustomerInput,
    @Ip() ip: string,
  ) {
    return this.customers.create(user, dto, ip ?? null);
  }

  @Patch(':id')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) dto: UpdateCustomerInput,
    @Ip() ip: string,
  ) {
    return this.customers.update(user, id, dto, ip ?? null);
  }

  @Post(':id/payments')
  @Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(customerPaymentSchema)) dto: CustomerPaymentInput,
    @Ip() ip: string,
  ) {
    return this.customers.recordPayment(user, id, dto, ip ?? null);
  }

  @Post(':id/adjustments')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(customerAdjustmentSchema)) dto: CustomerAdjustmentInput,
    @Ip() ip: string,
  ) {
    return this.customers.adjust(user, id, dto, ip ?? null);
  }
}
