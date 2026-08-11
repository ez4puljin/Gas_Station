import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type BankStatementQuery,
  bankStatementQuerySchema,
  type ImportBankStatementInput,
  importBankStatementSchema,
  type UpdateBankTxnInput,
  updateBankTxnSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BankService } from './bank.service';

/** Банкны хуулга — зөвхөн нягтлан (owner/admin bypass). */
@Controller('bank-statements')
@Roles(RoleKey.ACCOUNTANT)
export class BankController {
  constructor(private readonly bank: BankService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(bankStatementQuerySchema)) q: BankStatementQuery,
  ) {
    return this.bank.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bank.get(user, id);
  }

  /** Хөтөч дээр задалсан хуулгыг хүлээж авна (файл биш JSON). */
  @Post('import')
  import(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(importBankStatementSchema)) dto: ImportBankStatementInput,
    @Ip() ip: string,
  ) {
    return this.bank.importStatement(user, dto, ip ?? null);
  }

  @Patch('transactions/:txnId')
  updateTxn(
    @CurrentUser() user: AuthUser,
    @Param('txnId') txnId: string,
    @Body(new ZodValidationPipe(updateBankTxnSchema)) dto: UpdateBankTxnInput,
    @Ip() ip: string,
  ) {
    return this.bank.updateTxn(user, txnId, dto, ip ?? null);
  }

  @Post(':id/post')
  post(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.bank.postStatement(user, id, ip ?? null);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.bank.remove(user, id, ip ?? null);
  }
}
