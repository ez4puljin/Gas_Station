import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type LeaveQuery,
  leaveQuerySchema,
  type LeaveRejectInput,
  leaveRejectSchema,
  type LeaveRequestInput,
  leaveRequestSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LeaveService } from './leave.service';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const balancesQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
const onLeaveQuerySchema = z.object({ date: ymd.optional() });

function ubToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function ubYear(): number {
  return new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
}

/** Чөлөө — ахлагч/менежер/нягтлан (owner/admin bypass). Батлах/татгалзах эрхийг service дотор нягтлана. */
@Controller('leave')
@Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('employees')
  employees(@CurrentUser() user: AuthUser) {
    return this.leave.listEmployees(user);
  }

  @Get('balances')
  balances(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(balancesQuerySchema)) q: { year?: number },
  ) {
    return this.leave.balances(user, q.year ?? ubYear());
  }

  @Get('on-leave')
  onLeave(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(onLeaveQuerySchema)) q: { date?: string },
  ) {
    return this.leave.onLeave(user, q.date ?? ubToday());
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(leaveQuerySchema)) q: LeaveQuery,
  ) {
    return this.leave.list(user, q);
  }

  @Post('request')
  request(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(leaveRequestSchema)) dto: LeaveRequestInput,
    @Ip() ip: string,
  ) {
    return this.leave.request(user, dto, ip ?? null);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.leave.approve(user, id, ip ?? null);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leaveRejectSchema)) dto: LeaveRejectInput,
    @Ip() ip: string,
  ) {
    return this.leave.reject(user, id, dto, ip ?? null);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.leave.cancel(user, id, ip ?? null);
  }
}
