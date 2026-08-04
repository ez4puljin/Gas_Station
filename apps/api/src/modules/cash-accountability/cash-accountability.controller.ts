import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import {
  type CashCaseQuery,
  cashCaseQuerySchema,
  type CashScorecardQuery,
  cashScorecardQuerySchema,
  type ResolveCashCaseInput,
  resolveCashCaseSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CashAccountabilityService } from './cash-accountability.service';

/** Кассын хариуцлага — менежер/нягтлан (owner/admin bypass). Кассчин өөрөө хандахгүй. */
@Controller('cash-cases')
@Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
export class CashAccountabilityController {
  constructor(private readonly cases: CashAccountabilityService) {}

  @Get('scorecard')
  scorecard(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cashScorecardQuerySchema)) q: CashScorecardQuery,
  ) {
    return this.cases.scorecard(user, q);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cashCaseQuerySchema)) q: CashCaseQuery,
  ) {
    return this.cases.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cases.get(user, id);
  }

  @Post(':id/resolve')
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveCashCaseSchema)) dto: ResolveCashCaseInput,
    @Ip() ip: string,
  ) {
    return this.cases.resolve(user, id, dto, ip ?? null);
  }
}
