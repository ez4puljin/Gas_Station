import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PricingService } from './pricing.service';

/**
 * POS / Түлш борлуулалт — CLAUDE.md §7.1.
 * Борлуулалт бүр transaction + audit + idempotency-тэй (§2.3, §8, §9),
 * нээлттэй ээлж + кассчинтай холбоотой.
 */
@Module({
  imports: [CustomersModule],
  controllers: [PosController],
  providers: [PosService, PricingService],
  exports: [PosService, PricingService],
})
export class PosModule {}
