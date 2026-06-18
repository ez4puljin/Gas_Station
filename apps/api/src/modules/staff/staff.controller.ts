import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type RequestCloseShiftInput,
  requestCloseShiftSchema,
  type RequestOpenShiftInput,
  requestOpenShiftSchema,
  type ShiftRejectInput,
  shiftRejectSchema,
  type ShiftReportQuery,
  shiftReportQuerySchema,
  stationIdSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ShiftService } from './shift.service';
import { StaffService } from './staff.service';

const stationQuerySchema = z.object({ stationId: stationIdSchema });
type StationQuery = z.infer<typeof stationQuerySchema>;

@Controller('staff')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly shifts: ShiftService,
  ) {}

  @Get('employees')
  @Roles(RoleKey.STATION_MANAGER, RoleKey.ACCOUNTANT)
  listEmployees(@CurrentUser() user: AuthUser) {
    return this.staff.listEmployees(user);
  }

  // Хяналтын самбар (нягтлан/менежер; owner/admin bypass) — салбар бүрийн төлөв/орлого/хүсэлт
  @Get('overview')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  overview(@CurrentUser() user: AuthUser) {
    return this.shifts.overview(user);
  }

  // ── Ээлж нээх: хүсэлт → батлах ──
  @Post('shifts/request-open')
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER)
  requestOpen(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(requestOpenShiftSchema)) dto: RequestOpenShiftInput,
    @Ip() ip: string,
  ) {
    return this.shifts.requestOpen(user, dto, ip ?? null);
  }

  // 'current'/'history' нь ':id'-аас ӨМНӨ — литералыг param барихаас сэргийлнэ
  @Get('shifts/current')
  currentShift(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stationQuerySchema)) query: StationQuery,
  ) {
    return this.shifts.current(user, query.stationId);
  }

  /** Ээлжийн түүх (тайлан) — нягтлан/менежер. */
  @Get('shifts/history')
  @Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
  history(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(shiftReportQuerySchema)) q: ShiftReportQuery,
  ) {
    return this.shifts.listShifts(user, q);
  }

  @Get('shifts/:id')
  getShift(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shifts.get(user, id);
  }

  /** Ээлжийн Z-тайлан. */
  @Get('shifts/:id/z-report')
  zReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shifts.zReport(user, id);
  }

  @Post('shifts/:id/approve-open')
  @Roles(RoleKey.ACCOUNTANT)
  approveOpen(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.shifts.approveOpen(user, id, ip ?? null);
  }

  // ── Ээлж хаах: хүсэлт → батлах ──
  @Post('shifts/:id/request-close')
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER)
  requestClose(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(requestCloseShiftSchema)) dto: RequestCloseShiftInput,
    @Ip() ip: string,
  ) {
    return this.shifts.requestClose(user, id, dto, ip ?? null);
  }

  @Post('shifts/:id/approve-close')
  @Roles(RoleKey.ACCOUNTANT)
  approveClose(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.shifts.approveClose(user, id, ip ?? null);
  }

  @Post('shifts/:id/reject')
  @Roles(RoleKey.ACCOUNTANT)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(shiftRejectSchema)) dto: ShiftRejectInput,
    @Ip() ip: string,
  ) {
    return this.shifts.reject(user, id, dto, ip ?? null);
  }
}
