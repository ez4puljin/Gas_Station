import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Харилцагч ба зээл/авлага — компани-хэмжээнд. POS зээлийн борлуулалт нь
 * CustomersService.chargeCreditInTx-ийг sale transaction дотроос дуудна.
 */
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
