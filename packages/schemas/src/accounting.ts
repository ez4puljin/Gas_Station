import { z } from 'zod';
import { AccountType, JournalSource } from '@fuel/types';
import { dateOnlySchema } from './finance';
import { mntNonNegativeSchema } from './money';

// ── Данс (Chart of Accounts) ──
export const createAccountSchema = z.object({
  code: z.string().min(1, 'Код шаардлагатай').max(20),
  name: z.string().min(1, 'Нэр шаардлагатай'),
  type: z.nativeEnum(AccountType),
  parentCode: z.string().optional(),
  isPostable: z.boolean().default(true),
  description: z.string().optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  isPostable: z.boolean().optional(),
  description: z.string().nullable().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// ── Журналын бичилт (давхар бичилт) ──
/** Нэг мөр: дебет ЭСВЭЛ кредитийн зөвхөн НЭГ талтай. */
export const journalLineSchema = z
  .object({
    accountCode: z.string().min(1, 'Данс сонгоно уу'),
    debitMnt: mntNonNegativeSchema.optional(),
    creditMnt: mntNonNegativeSchema.optional(),
    stationId: z.string().optional(),
    memo: z.string().optional(),
  })
  .refine(
    (l) => {
      const d = l.debitMnt ?? 0n;
      const c = l.creditMnt ?? 0n;
      return (d > 0n) !== (c > 0n); // яг нэг тал нь эерэг
    },
    { message: 'Мөр бүр дебет ЭСВЭЛ кредитийн зөвхөн нэг талтай байна' },
  );
export type JournalLineInput = z.infer<typeof journalLineSchema>;

/** Журналын толгой — нийт дебет = нийт кредит (давхар бичилтийн тэнцэл). */
export const createJournalEntrySchema = z
  .object({
    date: dateOnlySchema,
    stationId: z.string().optional(),
    source: z.nativeEnum(JournalSource).optional(),
    memo: z.string().optional(),
    lines: z.array(journalLineSchema).min(2, 'Дор хаяж 2 мөр шаардлагатай'),
  })
  .refine(
    (e) => {
      const td = e.lines.reduce((s, l) => s + (l.debitMnt ?? 0n), 0n);
      const tc = e.lines.reduce((s, l) => s + (l.creditMnt ?? 0n), 0n);
      return td === tc && td > 0n;
    },
    { message: 'Нийт дебет = нийт кредит байх ёстой (тэнцэхгүй байна)' },
  );
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;

// ── Тайлангийн муж ──
export const accountingPeriodSchema = z
  .object({ from: dateOnlySchema, to: dateOnlySchema, stationId: z.string().optional() })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type AccountingPeriodQuery = z.infer<typeof accountingPeriodSchema>;

export const balanceSheetQuerySchema = z.object({
  asOf: dateOnlySchema,
  stationId: z.string().optional(),
});
export type BalanceSheetQuery = z.infer<typeof balanceSheetQuerySchema>;
