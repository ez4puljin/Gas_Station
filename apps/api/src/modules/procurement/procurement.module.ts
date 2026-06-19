import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

/**
 * Худалдан авалт (procurement) + нийлүүлэгчийн өглөг (AP) — CLAUDE.md §9.
 * Нэг нийлүүлэгчээс түлш/бараа авч олон салбар/сав руу хуваарилна; PENDING→RECEIVED.
 */
@Module({
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
