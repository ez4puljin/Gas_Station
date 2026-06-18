import { z } from 'zod';
import { isoDateSchema } from './common';
import { createSaleSchema } from './pos';

/**
 * Offline sync — §9. Offline үед үүссэн үйлдлийг багцаар нэгтгэнэ.
 * clientGeneratedId-аар idempotent (давхар sync хорино).
 */
export const syncSaleItemSchema = z.object({
  type: z.literal('sale.create'),
  clientGeneratedId: z.string().min(1),
  clientCreatedAt: isoDateSchema.optional(),
  payload: createSaleSchema,
});
export type SyncSaleItem = z.infer<typeof syncSaleItemSchema>;

export const syncPushSchema = z.object({
  stationId: z.string().min(1),
  deviceId: z.string().optional(),
  items: z.array(syncSaleItemSchema).min(1).max(100),
});
export type SyncPushInput = z.infer<typeof syncPushSchema>;

export const syncPullQuerySchema = z.object({ stationId: z.string().min(1) });
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;
