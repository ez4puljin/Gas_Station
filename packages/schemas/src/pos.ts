import { z } from 'zod';
import { PaymentMethod, ReceiptCustomerType, SaleItemType, SaleStatus } from '@fuel/types';
import { stationIdSchema, reasonSchema } from './common';
import { dateOnlySchema } from './finance';
import { mntPositiveSchema } from './money';

/** Тоо хэмжээний орц — эерэг, ≤3 бутархай */
const quantityInput = z.union([
  z.number().positive(),
  z.string().regex(/^\d+(\.\d{1,3})?$/, 'Тоо хэмжээ буруу'),
]);

export const saleLineSchema = z
  .object({
    type: z.nativeEnum(SaleItemType),
    productId: z.string().optional(), // PRODUCT үед
    fuelGradeId: z.string().optional(), // FUEL үед
    nozzleId: z.string().optional(), // FUEL үед (тоолуур холбох, заавал биш)
    quantity: quantityInput.optional(),
    // ЗӨВХӨН түлш: мөнгөн дүнгээр авах (литр = дүн / үнэ). quantity-тэй сонголттой.
    amountMnt: mntPositiveSchema.optional(),
  })
  .refine((l) => (l.type === SaleItemType.FUEL ? !!l.fuelGradeId : !!l.productId), {
    message: 'FUEL мөрөнд fuelGradeId, PRODUCT мөрөнд productId шаардлагатай',
  })
  .refine(
    (l) => (l.type === SaleItemType.FUEL ? !!l.quantity || !!l.amountMnt : !!l.quantity),
    { message: 'Тоо хэмжээ (литр/ширхэг) эсвэл түлшний дүн шаардлагатай' },
  );
export type SaleLineInput = z.infer<typeof saleLineSchema>;

export const paymentInputSchema = z
  .object({
    method: z.nativeEnum(PaymentMethod),
    amount: mntPositiveSchema,
    // ЗӨВХӨН masked (****1234) — §2.5. Бүтэн картын дугаар хэзээ ч хүлээж авахгүй.
    maskedPan: z
      .string()
      .regex(/^\*{2,}\d{4}$/, 'Зөвхөн masked карт (****1234)')
      .optional(),
    // Гүйлгээний/зөвшөөрлийн лавлагаа — эмзэг биш гэдгийг ХАТУУ баталгаажуулна (§2.5):
    // зөвхөн үсэг/тоо/зураас, картын дугаар (13-19 цуваа тоо) хориотой.
    reference: z
      .string()
      .trim()
      .max(64)
      .regex(/^[A-Za-z0-9-]+$/, 'Зөвхөн үсэг, тоо, зураас')
      .optional(),
  })
  .refine((p) => !p.reference || !/\d{13,19}/.test(p.reference), {
    message: 'Картын бүтэн дугаарыг лавлагаанд бичих хориотой',
    path: ['reference'],
  })
  .refine(
    (p) => !p.maskedPan || p.method === PaymentMethod.CARD || p.method === PaymentMethod.FUEL_CARD,
    { message: 'maskedPan зөвхөн карт/түлшний карт төлбөрт', path: ['maskedPan'] },
  );
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const createSaleSchema = z
  .object({
    stationId: z.string().min(1),
    shiftId: z.string().min(1),
    // Offline idempotency — давхар sync-ийг хорино (§9)
    clientGeneratedId: z.string().min(1, 'clientGeneratedId шаардлагатай'),
    // Массивын дээд хязгаар — hot path-ийн transaction-ийг хамгаална (§1 тогтвортой)
    lines: z.array(saleLineSchema).min(1, 'Дор хаяж 1 мөр шаардлагатай').max(200),
    // Split payment: олон хэлбэр; нэг хэлбэрийг давхардуулахгүй (доорх refine).
    payments: z.array(paymentInputSchema).min(1, 'Дор хаяж 1 төлбөр шаардлагатай').max(10),
    // И-баримт — иргэн/байгууллага (§12)
    customerType: z.nativeEnum(ReceiptCustomerType).optional(),
    customerTin: z.string().optional(),
    // Зээлийн борлуулалтын харилцагч (CREDIT төлбөртэй үед заавал)
    customerId: z.string().optional(),
  })
  .refine(
    (s) => new Set(s.payments.map((p) => p.method)).size === s.payments.length,
    { message: 'Нэг төлбөрийн хэлбэрийг давхардуулж болохгүй', path: ['payments'] },
  );
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const voidSaleSchema = z.object({ reason: reasonSchema });
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

/** Буцаалтын төлбөрийн мөр — мөнгийг ХЭРХЭН буцаах (хэлбэр бүрээр, §7.3). */
export const refundLineInputSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: mntPositiveSchema,
});
export type RefundLineInput = z.infer<typeof refundLineInputSchema>;

/** Буцаалтын бараа мөр — ЮУГ буцааж нөөцөд нэмэх (мөр+тоо хэмжээ). */
export const refundItemInputSchema = z.object({
  saleLineId: z.string().min(1),
  quantity: quantityInput, // буцаах тоо хэмжээ (эерэг, ≤3 бутархай)
});
export type RefundItemInput = z.infer<typeof refundItemInputSchema>;

export const refundSaleSchema = z
  .object({
    reason: reasonSchema,
    // ЮУГ буцаах вэ — мөр+тоо. Заавал бол нөөц сэргэнэ (§7.1). Хоосон бол зөвхөн мөнгөн
    // буцаалт (нөөц сэргэхгүй; ж: үнийн маргаан) — энэ үед tenders нийлбэр = буцаалтын дүн.
    items: z.array(refundItemInputSchema).max(200).optional().default([]),
    // Мөнгийг ХЭРХЭН буцаах — хэлбэр бүрээр (split-tender); серверт төлсөн дүнгээр хязгаарлана.
    tenders: z.array(refundLineInputSchema).min(1, 'Дор хаяж 1 буцаалтын мөр').max(10),
  })
  .refine((r) => new Set(r.tenders.map((l) => l.method)).size === r.tenders.length, {
    message: 'Нэг төлбөрийн хэлбэрийг давхардуулж болохгүй',
    path: ['tenders'],
  })
  .refine((r) => new Set(r.items.map((i) => i.saleLineId)).size === r.items.length, {
    message: 'Нэг борлуулалтын мөрийг давхардуулж болохгүй',
    path: ['items'],
  });
export type RefundSaleInput = z.infer<typeof refundSaleSchema>;

/** Борлуулалтын түүхийн шүүлтүүр — бүх талбар сонголттой (огноо UB бизнесийн өдөр). */
export const salesListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    stationId: stationIdSchema.optional(), // байхгүй бол хандах эрхтэй бүх салбар
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    cashierId: z.string().optional(),
    customerId: z.string().optional(),
    method: z.nativeEnum(PaymentMethod).optional(),
    fuelGradeId: z.string().optional(),
    productId: z.string().optional(),
    status: z.nativeEnum(SaleStatus).optional(),
    search: z.string().optional(), // saleNumber / харилцагч / ТТД
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'from нь to-оос хойш байж болохгүй',
    path: ['to'],
  });
export type SalesListQuery = z.infer<typeof salesListQuerySchema>;
