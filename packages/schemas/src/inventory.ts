import { z } from 'zod';
import { reasonSchema } from './common';
import { mntNonNegativeSchema } from './money';

/** Эерэг тоо хэмжээ (≤3 бутархай) */
const positiveQty = z.union([
  z.number().positive(),
  z.string().regex(/^\d+(\.\d{1,3})?$/, 'Тоо хэмжээ буруу'),
]);

/** Тэмдэгтэй тоо хэмжээ — adjustment-д (+ нэмэх, - хасах) */
const signedQty = z.union([
  z.number(),
  z.string().regex(/^-?\d+(\.\d{1,3})?$/, 'Тоо хэмжээ буруу'),
]);

/** Барааны зураг — хоосон, http(s) хаяг, эсвэл data:image (камер/файлаас шахсан data URL) */
const imageUrlSchema = z
  .string()
  .trim()
  .max(2_000_000) // ~1.5MB хүртэлх шахсан data URL (client дээр ~600px болгож жижгэрүүлнэ)
  .refine(
    (v) => v === '' || /^https?:\/\//i.test(v) || /^data:image\//i.test(v),
    'Зураг буруу байна',
  )
  .optional();

// --- Бараа (Product) ---
export const createProductSchema = z.object({
  sku: z.string().min(1, 'Барааны код шаардлагатай'),
  name: z.string().min(1, 'Нэр шаардлагатай'),
  groupId: z.string().optional(), // Барааны бүлэг
  supplierId: z.string().optional(), // Нийлүүлэгч
  category: z.string().optional(), // legacy/чөлөөт
  unit: z.string().default('ш'),
  barcode: z.string().trim().max(64).optional(),
  imageUrl: imageUrlSchema,
  priceMnt: mntNonNegativeSchema,
  costMnt: mntNonNegativeSchema.optional(),
  isVatable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Засвар — бүх талбар сонголттой (өгсөн талбарыг л шинэчилнэ) */
export const updateProductSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  groupId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit: z.string().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  imageUrl: imageUrlSchema.or(z.null()),
  priceMnt: mntNonNegativeSchema.optional(),
  costMnt: mntNonNegativeSchema.nullable().optional(),
  isVatable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// --- Барааны бүлэг (ProductGroup) ---
export const createProductGroupSchema = z.object({
  name: z.string().min(1, 'Бүлгийн нэр шаардлагатай'),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductGroupInput = z.infer<typeof createProductGroupSchema>;

export const updateProductGroupSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductGroupInput = z.infer<typeof updateProductGroupSchema>;

// --- Нийлүүлэгч (Supplier) ---
export const createSupplierSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  phone: z.string().optional(),
  regNo: z.string().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// --- Нөөцийн засвар (Adjustment) — §2.7 reason заавал ---
export const stockAdjustmentSchema = z
  .object({
    stationId: z.string().min(1),
    productId: z.string().optional(),
    fuelTankId: z.string().optional(),
    quantityDelta: signedQty, // + нэмэх, - хасах
    reason: reasonSchema,
    unitCostMnt: mntNonNegativeSchema.optional(),
  })
  .refine((d) => !!d.productId !== !!d.fuelTankId, {
    message: 'productId эсвэл fuelTankId-ийн ЗӨВХӨН нэгийг заана',
  });
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

// --- Түлшний нийлүүлэлт хүлээн авах ---
export const fuelDeliverySchema = z.object({
  stationId: z.string().min(1),
  tankId: z.string().min(1),
  supplierId: z.string().optional(),
  liters: positiveQty,
  unitCostMnt: mntNonNegativeSchema, // литрийн өртөг
  documentNo: z.string().optional(),
});
export type FuelDeliveryInput = z.infer<typeof fuelDeliverySchema>;

// --- Резервуарын түвшин (reading / тооцоо нийлэх) ---
export const tankReadingSchema = z.object({
  stationId: z.string().min(1),
  tankId: z.string().min(1),
  levelLiters: positiveQty,
  temperatureC: z.union([z.number(), z.string()]).optional(),
  source: z.enum(['manual', 'atg']).default('manual'),
});
export type TankReadingInput = z.infer<typeof tankReadingSchema>;

// --- Дахин захиалах түвшин тохируулах (бараа alert идэвхжүүлэх) ---
export const setReorderLevelSchema = z.object({
  stationId: z.string().min(1),
  productId: z.string().min(1),
  reorderLevel: z.union([
    z.number().min(0),
    z.string().regex(/^\d+(\.\d{1,3})?$/, 'Түвшин буруу'),
  ]),
});
export type SetReorderLevelInput = z.infer<typeof setReorderLevelSchema>;

// --- Салбар хооронд шилжүүлэг (бараа) — §10 2 талын ledger ---
export const stockTransferSchema = z
  .object({
    fromStationId: z.string().min(1),
    toStationId: z.string().min(1),
    productId: z.string().min(1),
    quantity: positiveQty,
    reason: reasonSchema,
  })
  .refine((d) => d.fromStationId !== d.toStationId, {
    message: 'Эх ба хүлээн авах салбар ялгаатай байх ёстой',
  });
export type StockTransferInput = z.infer<typeof stockTransferSchema>;
