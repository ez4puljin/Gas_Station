import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type AccountQuery,
  accountQuerySchema,
  type AccountingPeriodQuery,
  accountingPeriodSchema,
  type BalanceSheetQuery,
  balanceSheetQuerySchema,
  type CreateAccountInput,
  createAccountSchema,
  type CreateJournalEntryInput,
  createJournalEntrySchema,
  type UpdateAccountInput,
  updateAccountSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccountingService } from './accounting.service';

const listQuerySchema = accountingPeriodSchema.innerType().extend({ source: z.string().optional() });
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  /** Өгөгдмөл дансны төлөвлөгөө үүсгэх (анх удаа). */
  @Post('setup')
  @Roles(RoleKey.ACCOUNTANT)
  setup(@CurrentUser() user: AuthUser) {
    return this.accounting.ensureChartOfAccounts(user.companyId);
  }

  @Get('accounts')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  listAccounts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(accountQuerySchema)) q: AccountQuery,
  ) {
    return this.accounting.listAccounts(user, q);
  }

  @Post('accounts')
  @Roles(RoleKey.ACCOUNTANT)
  createAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAccountSchema)) dto: CreateAccountInput,
    @Ip() ip: string,
  ) {
    return this.accounting.createAccount(user, dto, ip ?? null);
  }

  @Patch('accounts/:id')
  @Roles(RoleKey.ACCOUNTANT)
  updateAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) dto: UpdateAccountInput,
    @Ip() ip: string,
  ) {
    return this.accounting.updateAccount(user, id, dto, ip ?? null);
  }

  @Delete('accounts/:id')
  @Roles(RoleKey.ACCOUNTANT)
  deleteAccount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.accounting.deleteAccount(user, id, ip ?? null);
  }

  // ── Журнал ──
  @Get('journal')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  listEntries(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery,
  ) {
    return this.accounting.listEntries(user, q.from, q.to, q.stationId, q.source);
  }

  @Get('journal/:id')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  getEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounting.getEntry(user, id);
  }

  @Post('journal')
  @Roles(RoleKey.ACCOUNTANT)
  createEntry(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createJournalEntrySchema)) dto: CreateJournalEntryInput,
    @Ip() ip: string,
  ) {
    return this.accounting.createManualEntry(user, dto, ip ?? null);
  }

  @Post('journal/:id/reverse')
  @Roles(RoleKey.ACCOUNTANT)
  reverse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.accounting.reverseEntry(user, id, ip ?? null);
  }

  // ── Тайлан ──
  @Get('trial-balance')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  trialBalance(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(accountingPeriodSchema)) q: AccountingPeriodQuery,
  ) {
    return this.accounting.trialBalance(user, q.from, q.to, q.stationId);
  }

  @Get('pnl')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  pnl(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(accountingPeriodSchema)) q: AccountingPeriodQuery,
  ) {
    return this.accounting.profitAndLoss(user, q.from, q.to, q.stationId);
  }

  @Get('balance-sheet')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  balanceSheet(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(balanceSheetQuerySchema)) q: BalanceSheetQuery,
  ) {
    return this.accounting.balanceSheet(user, q.asOf, q.stationId);
  }
}
