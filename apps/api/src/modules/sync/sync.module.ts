import { Module } from '@nestjs/common';
import { PosModule } from '../pos/pos.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Offline → төв sync — CLAUDE.md §9.
 * SyncQueueItem дарааллыг нэгтгэх, idempotency (clientGeneratedId),
 * мастер дата pull (offline кэш). Борлуулалтыг PosService-ээр (idempotent) боловсруулна.
 */
@Module({
  imports: [PosModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
