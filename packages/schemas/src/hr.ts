import { z } from 'zod';
import { mntNonNegativeSchema } from './money';

/** Ажилтны сарын суурь цалин тохируулах. */
export const setSalarySchema = z.object({
  baseSalaryMnt: mntNonNegativeSchema,
});
export type SetSalaryInput = z.infer<typeof setSalarySchema>;

/** Сарын цалин бодуулах — YYYY-MM + ажилтан бүрийн нэмэгдэл (сонголттой). */
export const runPayrollSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM хэлбэртэй байх ёстой'),
  bonuses: z
    .array(z.object({ employeeId: z.string().min(1), amountMnt: mntNonNegativeSchema }))
    .optional(),
});
export type RunPayrollInput = z.infer<typeof runPayrollSchema>;
