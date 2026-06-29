import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type RunPayrollInput,
  runPayrollSchema,
  type SetSalaryInput,
  setSalarySchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayrollService } from './payroll.service';

const periodSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

@Controller('payroll')
@Roles(RoleKey.ACCOUNTANT)
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('employees')
  employees(@CurrentUser() user: AuthUser) {
    return this.payroll.listEmployees(user);
  }

  @Patch('employees/:id/salary')
  setSalary(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setSalarySchema)) dto: SetSalaryInput,
    @Ip() ip: string,
  ) {
    return this.payroll.setSalary(user, id, dto, ip ?? null);
  }

  @Get('preview')
  preview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(periodSchema)) q: { period: string },
  ) {
    return this.payroll.preview(user, q.period);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.payroll.listRuns(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payroll.getRun(user, id);
  }

  @Post('run')
  run(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(runPayrollSchema)) dto: RunPayrollInput,
    @Ip() ip: string,
  ) {
    return this.payroll.run(user, dto, ip ?? null);
  }

  @Post(':id/reverse')
  reverse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.payroll.reverse(user, id, ip ?? null);
  }
}
