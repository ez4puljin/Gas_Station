import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Харилцагч ба зээл/авлага — компани-хэмжээнд. POS зээлийн борлуулалт нь
 * CustomersService.chargeCreditInTx-ийг sale transaction дотроос дуудна.
 * Төлбөрийг GL-д бичихэд AccountingService ашиглана.
 */
@Module({
  imports: [AccountingModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
