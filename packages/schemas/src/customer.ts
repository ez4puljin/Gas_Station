import { z } from 'zod';
import { PaymentMethod } from '@fuel/types';
import { reasonSchema } from './common';
import { dateOnlySchema } from './finance';
import { mntNonNegativeSchema, mntPositiveSchema, mntSchema } from './money';

/** Авлага-өглөгийн дэвтрийн муж — эхний/эцсийн үлдэгдэл тооцоход. */
export const ledgerQuerySchema = z
  .object({ from: dateOnlySchema, to: dateOnlySchema })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

/** Харилцагч — компанид харьяалагдана (бүх салбарт зээлээр авна). */
export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Нэр шаардлагатай'),
  code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  regNo: z.string().optional(),
  address: z.string().optional(),
  creditLimitMnt: mntNonNegativeSchema.optional(), // default 0 = лимитгүй
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** Авлага барагдуулах төлбөр (балансыг бууруулна). */
export const customerPaymentSchema = z.object({
  amount: mntPositiveSchema,
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  stationId: z.string().optional(),
  note: z.string().optional(),
});
export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;

/** Гар засвар — тэмдэгтэй дүн (+ авлага нэмэх / - бууруулах), reason заавал (§2.7). */
export const customerAdjustmentSchema = z.object({
  amountMnt: mntSchema,
  reason: reasonSchema,
});
export type CustomerAdjustmentInput = z.infer<typeof customerAdjustmentSchema>;
