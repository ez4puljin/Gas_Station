import { z } from 'zod';
import { PaymentMethod } from '@fuel/types';
import { mntNonNegativeSchema } from './money';

/** Зураг — хоосон, http(s), эсвэл data:image (камер/файлаас) */
const imageUrlSchema = z
  .string()
  .trim()
  .max(2_000_000)
  .refine((v) => v === '' || /^https?:\/\//i.test(v) || /^data:image\//i.test(v), 'Зураг буруу')
  .optional();

/** Савны түлшний хэмжээ — шугаман төмрөөр см (заавал) + литр (заавал биш) + зураг */
export const shiftTankReadingSchema = z.object({
  tankId: z.string().min(1),
  centimeters: z.union([
    z.number().nonnegative(),
    z.string().regex(/^\d+(\.\d{1,2})?$/, 'см буруу'),
  ]),
  liters: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,3})?$/, 'литр буруу')])
    .optional(),
  imageUrl: imageUrlSchema,
});
export type ShiftTankReadingInput = z.infer<typeof shiftTankReadingSchema>;

/** Ээлж эхлүүлэх ХҮСЭЛТ — савны хэмжээ хамт (нягтлан/админ батлахыг хүлээнэ) */
export const requestOpenShiftSchema = z.object({
  stationId: z.string().min(1),
  openingCashMnt: mntNonNegativeSchema,
  note: z.string().optional(),
  tankReadings: z.array(shiftTankReadingSchema).max(50).default([]),
});
export type RequestOpenShiftInput = z.infer<typeof requestOpenShiftSchema>;

/** Төлбөрийн хэлбэрээр тушаасан дүн */
export const shiftTenderSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  declaredMnt: mntNonNegativeSchema,
});
export type ShiftTenderInput = z.infer<typeof shiftTenderSchema>;

/** Ээлж хаах ХҮСЭЛТ — тоолсон бэлэн + хэлбэрээр тушаалт + савны хэмжээ */
export const requestCloseShiftSchema = z
  .object({
    countedCashMnt: mntNonNegativeSchema,
    note: z.string().optional(),
    tankReadings: z.array(shiftTankReadingSchema).max(50).default([]),
    tenders: z.array(shiftTenderSchema).max(10).default([]),
  })
  .refine((c) => new Set(c.tenders.map((t) => t.method)).size === c.tenders.length, {
    message: 'Нэг төлбөрийн хэлбэрийг давхардуулж болохгүй',
    path: ['tenders'],
  });
export type RequestCloseShiftInput = z.infer<typeof requestCloseShiftSchema>;

/** Батлах/татгалзах */
export const shiftRejectSchema = z.object({ reason: z.string().optional() });
export type ShiftRejectInput = z.infer<typeof shiftRejectSchema>;
