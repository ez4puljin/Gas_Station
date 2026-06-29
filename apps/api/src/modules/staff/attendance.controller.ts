import { Body, Controller, Delete, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type AttendanceDeleteInput,
  attendanceDeleteSchema,
  type AttendanceQuery,
  attendanceQuerySchema,
  type ClockInInput,
  clockInSchema,
  type ClockOutInput,
  clockOutSchema,
  type ManualAttendanceInput,
  manualAttendanceSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AttendanceService } from './attendance.service';

const currentQuerySchema = z.object({ stationId: z.string().optional() });

/** Цаг бүртгэл — ээлжийн ахлагч/менежер/нягтлан (owner/admin bypass). */
@Controller('attendance')
@Roles(RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('employees')
  employees(@CurrentUser() user: AuthUser) {
    return this.attendance.listEmployees(user);
  }

  @Get('current')
  current(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(currentQuerySchema)) q: { stationId?: string },
  ) {
    return this.attendance.current(user, q.stationId);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) q: AttendanceQuery,
  ) {
    return this.attendance.summary(user, q);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) q: AttendanceQuery,
  ) {
    return this.attendance.list(user, q);
  }

  @Post('clock-in')
  clockIn(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(clockInSchema)) dto: ClockInInput,
    @Ip() ip: string,
  ) {
    return this.attendance.clockIn(user, dto, ip ?? null);
  }

  @Post('manual')
  manual(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(manualAttendanceSchema)) dto: ManualAttendanceInput,
    @Ip() ip: string,
  ) {
    return this.attendance.manual(user, dto, ip ?? null);
  }

  @Post(':id/clock-out')
  clockOut(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(clockOutSchema)) dto: ClockOutInput,
    @Ip() ip: string,
  ) {
    return this.attendance.clockOut(user, id, dto, ip ?? null);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attendanceDeleteSchema)) dto: AttendanceDeleteInput,
    @Ip() ip: string,
  ) {
    return this.attendance.remove(user, id, dto, ip ?? null);
  }
}
