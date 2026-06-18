import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

/**
 * Санхүү / Тайлан / Аналитик — CLAUDE.md §7.4.
 * Skeleton: өдрийн тайлан, грейдээр борлуулалт/маржин, НӨАТ, KPI самбар, экспорт, аномали.
 * Тайлан 2 түвшинд: салбарын + компанийн нэгдсэн (§10).
 */
@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
