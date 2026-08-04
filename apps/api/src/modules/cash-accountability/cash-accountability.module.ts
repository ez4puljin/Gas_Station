import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CashAccountabilityController } from './cash-accountability.controller';
import { CashAccountabilityService } from './cash-accountability.service';

/**
 * Кассын хариуцлага — ээлжийн бэлэн мөнгөний зөрүүг кассчинд холбож шийдвэрлэх (loss prevention).
 * StaffModule (ээлж хаах) ба PayrollModule (цалингаас суутгах) ашиглана — тиймээс exports.
 */
@Module({
  imports: [AccountingModule],
  controllers: [CashAccountabilityController],
  providers: [CashAccountabilityService],
  exports: [CashAccountabilityService],
})
export class CashAccountabilityModule {}
