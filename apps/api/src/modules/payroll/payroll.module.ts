import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Цалин — сарын тооцоо (НДШ/ХХОАТ суутгал) + GL-д бичих. AccountingService ашиглана.
 */
@Module({
  imports: [AccountingModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
