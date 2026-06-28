import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

/**
 * Худалдан авалт (procurement) + нийлүүлэгчийн өглөг (AP) — CLAUDE.md §9.
 * Нэг нийлүүлэгчээс түлш/бараа авч олон салбар/сав руу хуваарилна; PENDING→RECEIVED.
 * Хүлээн авалт/төлбөрийг GL-д бичихэд AccountingService ашиглана.
 */
@Module({
  imports: [AccountingModule],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
