import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

/**
 * Санхүү / Тайлан / Аналитик — CLAUDE.md §7.4.
 * Өдрийн тайлан, грейдээр борлуулалт/маржин, НӨАТ, KPI самбар, экспорт, аномали + EOD хаалт (GL-д бичих).
 * Тайлан 2 түвшинд: салбарын + компанийн нэгдсэн (§10). EOD-д AccountingService ашиглана.
 */
@Module({
  imports: [AccountingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
