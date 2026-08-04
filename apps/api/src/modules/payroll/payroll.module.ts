import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CashAccountabilityModule } from '../cash-accountability/cash-accountability.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Цалин — сарын тооцоо (НДШ/ХХОАТ суутгал) + кассын дутагдлын суутгал + GL-д бичих.
 */
@Module({
  imports: [AccountingModule, CashAccountabilityModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
