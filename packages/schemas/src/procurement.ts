import { z } from 'zod';
import { PaymentMethod, SaleItemType } from '@fuel/types';
import { reasonSchema } from './common';
import { mntNonNegativeSchema, mntPositiveSchema, mntSchema } from './money';

/** Эерэг тоо хэмжээ (≤3 бутархай) — литр / ширхэг. */
const positiveQty = z.union([
  z.number().positive(),
  z.string().regex(/^\d+(\.\d{1,3})?$/, 'Тоо хэмжээ буруу'),
]);

// ── Нийлүүлэгч (Supplier) — create нь inventory.ts-д. Энд update + AP. ──

/** Нийлүүлэгч засвар — өгсөн талбарыг л шинэчилнэ. */
export const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  contact: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  regNo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/** Нийлүүлэгчид төлбөр төлөх (өглөгийг бууруулна). */
export const supplierPaymentSchema = z.object({
  amount: mntPositiveSchema,
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  note: z.string().optional(),
});
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

/** Гар засвар — тэмдэгтэй дүн (+ өглөг нэмэх / - бууруулах), reason заавал (§2.7). */
export const supplierAdjustmentSchema = z.object({
  amountMnt: mntSchema,
  reason: reasonSchema,
});
export type SupplierAdjustmentInput = z.infer<typeof supplierAdjustmentSchema>;

// ── Худалдан авалт (Purchase) ──

/**
 * Худалдан авалтын нэг мөр — нэг салбар руу нэг түлш (сав) ЭСВЭЛ нэг бараа.
 * FUEL → fuelGradeId + tankId; PRODUCT → productId. quantity = литр/ширхэг.
 */
export const purchaseLineSchema = z
  .object({
    stationId: z.string().min(1, 'Салбар сонгоно уу'),
    itemType: z.nativeEnum(SaleItemType),
    fuelGradeId: z.string().optional(),
    tankId: z.string().optional(),
    productId: z.string().optional(),
    quantity: positiveQty,
    unitCostMnt: mntNonNegativeSchema, // нэгж өртөг (литр / ширхэг)
  })
  .refine(
    (d) =>
      d.itemType === SaleItemType.FUEL
        ? !!d.fuelGradeId && !!d.tankId && !d.productId
        : !!d.productId && !d.fuelGradeId && !d.tankId,
    { message: 'FUEL → түлш+сав; PRODUCT → бараа сонгоно' },
  );
export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

/** Худалдан авалт үүсгэх — нэг нийлүүлэгчээс олон салбар/сав/бараа руу хуваарилна. */
export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Нийлүүлэгч сонгоно уу'),
  documentNo: z.string().optional(),
  note: z.string().optional(),
  lines: z.array(purchaseLineSchema).min(1, 'Дор хаяж нэг мөр шаардлагатай'),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

/** Худалдан авалтын мөр хүлээн авах — нөөц/сав нэмэгдэж, өглөг үүснэ. */
export const receivePurchaseLineSchema = z.object({
  documentNo: z.string().optional(),
});
export type ReceivePurchaseLineInput = z.infer<typeof receivePurchaseLineSchema>;

/** Худалдан авалтын жагсаалтын шүүлт. */
export const purchaseListQuerySchema = z.object({
  supplierId: z.string().optional(),
  stationId: z.string().optional(),
  status: z.enum(['PENDING', 'RECEIVED', 'CANCELLED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;
