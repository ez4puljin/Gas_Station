import { z } from 'zod';
import { reasonSchema } from './common';
import { mntPositiveSchema, mntSchema } from './money';

/** Касс↔сейф↔банк шилжүүлэг (DROP=касс→сейф, DEPOSIT=сейф→банк). Дүн эерэг. */
export const cashTransferSchema = z.object({
  stationId: z.string().min(1, 'Салбар сонгоно уу'),
  type: z.enum(['DROP', 'DEPOSIT']),
  amount: mntPositiveSchema,
  reference: z.string().optional(), // уут/баримтын дугаар
  note: z.string().optional(),
  shiftId: z.string().optional(),
});
export type CashTransferInput = z.infer<typeof cashTransferSchema>;

/** Сейфийн тооллогын засвар — тэмдэгтэй дүн (+ илүү / − дутуу), reason заавал (§2.7). */
export const cashAdjustSchema = z.object({
  stationId: z.string().min(1, 'Салбар сонгоно уу'),
  amountMnt: mntSchema,
  reason: reasonSchema,
});
export type CashAdjustInput = z.infer<typeof cashAdjustSchema>;
