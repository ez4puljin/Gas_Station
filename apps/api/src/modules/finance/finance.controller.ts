import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  type AnomalyQuery,
  anomalyQuerySchema,
  type ConsolidatedQuery,
  consolidatedQuerySchema,
  type DailyReportQuery,
  dailyReportQuerySchema,
  type KpiQuery,
  kpiQuerySchema,
  type OptionalStationRange,
  optionalStationRangeSchema,
  type RangeQuery,
  rangeQuerySchema,
  type SalesReportQuery,
  salesReportQuerySchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FinanceService } from './finance.service';

@Controller('finance')
@Roles(RoleKey.ACCOUNTANT, RoleKey.STATION_MANAGER)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('daily')
  daily(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(dailyReportQuerySchema)) q: DailyReportQuery,
  ) {
    return this.finance.dailyReport(user, q.stationId, q.date);
  }

  @Get('daily.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="daily-report.csv"')
  dailyCsv(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(dailyReportQuerySchema)) q: DailyReportQuery,
  ) {
    return this.finance.dailyReportCsv(user, q.stationId, q.date);
  }

  @Get('consolidated')
  consolidated(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(consolidatedQuerySchema)) q: ConsolidatedQuery,
  ) {
    return this.finance.consolidatedReport(user, q.date);
  }

  @Get('kpi')
  kpi(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(kpiQuerySchema)) q: KpiQuery,
  ) {
    return this.finance.kpi(user, q.date);
  }

  @Get('margin')
  margin(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(rangeQuerySchema)) q: RangeQuery,
  ) {
    return this.finance.fuelMargin(user, q.stationId, q.from, q.to);
  }

  @Get('anomalies')
  anomalies(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(anomalyQuerySchema)) q: AnomalyQuery,
  ) {
    return this.finance.anomalies(user, q.from, q.to, q.stationId);
  }

  /** Борлуулалтын тайлан — муж + харилцагч/түлш/бараа/кассчин/хэлбэр шүүлт. */
  @Get('sales-report')
  salesReport(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(salesReportQuerySchema)) q: SalesReportQuery,
  ) {
    return this.finance.salesReport(user, q);
  }

  /** НӨАТ-ын тайлан (output VAT 10%). */
  @Get('vat')
  vat(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(optionalStationRangeSchema)) q: OptionalStationRange,
  ) {
    return this.finance.vatReport(user, q);
  }
}
