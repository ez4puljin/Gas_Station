import { z } from 'zod';

// companyId-ийг ХЭЗЭЭ Ч body-оос авахгүй — нэвтэрсэн хэрэглэгчийн token-оос (§2.2/§10).
export const createStationSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1),
  address: z.string().optional(),
  timezone: z.string().default('Asia/Ulaanbaatar'),
});
export type CreateStationInput = z.infer<typeof createStationSchema>;

export const updateStationSchema = createStationSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateStationInput = z.infer<typeof updateStationSchema>;

// ── Резервуар (FuelTank) — салбар доторх ──
const tankQty = z.union([
  z.number().nonnegative(),
  z.string().regex(/^\d+(\.\d{1,3})?$/, 'Тоо буруу'),
]);

export const createFuelTankSchema = z.object({
  code: z.string().min(1, 'Савны код шаардлагатай'),
  fuelGradeId: z.string().min(1, 'Грейд сонгоно уу'),
  capacityLiters: tankQty,
  currentLiters: tankQty.optional(), // эхний түвшин (заавал биш)
  minLiters: tankQty.optional(), // alert босго
});
export type CreateFuelTankInput = z.infer<typeof createFuelTankSchema>;

// Тэмдэглэл: currentLiters-ийг ЭНД засахгүй — нөөц нь ledger-ээр (adjustment/reading §7.2).
export const updateFuelTankSchema = z.object({
  code: z.string().min(1).optional(),
  fuelGradeId: z.string().min(1).optional(),
  capacityLiters: tankQty.optional(),
  minLiters: tankQty.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateFuelTankInput = z.infer<typeof updateFuelTankSchema>;
