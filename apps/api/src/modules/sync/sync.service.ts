import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SyncPushInput } from '@fuel/schemas';
import { type AuthUser, SyncStatus } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertStationAccess } from '../../common/utils/station-access';
import { PosService } from '../pos/pos.service';

interface SyncItemResult {
  clientGeneratedId: string;
  status: 'synced' | 'duplicate' | 'failed';
  saleId?: string;
  error?: string;
}

/** Offline → төв sync — CLAUDE.md §9. Idempotent (clientGeneratedId), traceable (SyncQueueItem). */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pos: PosService,
  ) {}

  async push(user: AuthUser, input: SyncPushInput, ip: string | null) {
    await assertStationAccess(this.prisma, user, input.stationId);
    const results: SyncItemResult[] = [];

    for (const item of input.items) {
      const cid = item.clientGeneratedId;

      // Багцын stationId-тэй тохирох ёстой (cross-station хольцоос сэргийлнэ)
      if (item.payload.stationId !== input.stationId) {
        results.push({ clientGeneratedId: cid, status: 'failed', error: 'stationId зөрүүтэй' });
        continue;
      }

      // Аль хэдийн sync хийгдсэн бол давтахгүй (§9 idempotency)
      const prior = await this.prisma.syncQueueItem.findUnique({ where: { clientGeneratedId: cid } });
      if (prior && prior.status === SyncStatus.SYNCED) {
        const sale = await this.prisma.sale.findUnique({
          where: { clientGeneratedId: cid },
          select: { id: true },
        });
        results.push({ clientGeneratedId: cid, status: 'duplicate', saleId: sale?.id });
        continue;
      }

      const jsonPayload = JSON.parse(JSON.stringify(item.payload)) as Prisma.InputJsonValue;
      const clientCreatedAt = item.clientCreatedAt ? new Date(item.clientCreatedAt) : new Date();

      try {
        // createSale нь өөрөө idempotent (clientGeneratedId @unique) тул давхар үүсэхгүй
        const sale = await this.pos.createSale(user, item.payload, ip);
        await this.prisma.syncQueueItem.upsert({
          where: { clientGeneratedId: cid },
          update: { status: SyncStatus.SYNCED, processedAt: new Date(), attempts: { increment: 1 } },
          create: {
            stationId: input.stationId,
            clientGeneratedId: cid,
            deviceId: input.deviceId ?? null,
            operation: item.type,
            payload: jsonPayload,
            status: SyncStatus.SYNCED,
            attempts: 1,
            clientCreatedAt,
            processedAt: new Date(),
          },
        });
        results.push({ clientGeneratedId: cid, status: 'synced', saleId: sale.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync алдаа';
        await this.prisma.syncQueueItem.upsert({
          where: { clientGeneratedId: cid },
          update: { status: SyncStatus.FAILED, lastError: message, attempts: { increment: 1 } },
          create: {
            stationId: input.stationId,
            clientGeneratedId: cid,
            deviceId: input.deviceId ?? null,
            operation: item.type,
            payload: jsonPayload,
            status: SyncStatus.FAILED,
            attempts: 1,
            lastError: message,
            clientCreatedAt,
          },
        });
        results.push({ clientGeneratedId: cid, status: 'failed', error: message });
      }
    }

    return {
      stationId: input.stationId,
      serverTime: new Date().toISOString(),
      results,
      synced: results.filter((r) => r.status === 'synced').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };
  }

  /** Offline кэшлэх мастер дата — үнэ + бараа (§9). */
  async pull(user: AuthUser, stationId: string) {
    await assertStationAccess(this.prisma, user, stationId);
    const catalog = await this.pos.catalog(user, stationId);
    return { stationId, serverTime: new Date().toISOString(), ...catalog };
  }
}
