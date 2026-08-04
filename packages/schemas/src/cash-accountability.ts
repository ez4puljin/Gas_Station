import { z } from 'zod';

/**
 * Кассын хариуцлага — ээлжийн бэлэн мөнгөний зөрүүг ажилтанд холбож, шийдвэрлэх урсгал.
 * Зөрүү = тоолсон − тооцоолсон (сөрөг = ДУТАГДАЛ, эерэг = ИЛҮҮДЭЛ). Бүх дүн integer MNT (§2.1).
 */

export const CASH_CASE_STATUSES = ['OPEN', 'PENDING_DEDUCTION', 'RESOLVED'] as const;
export type CashCaseStatus = (typeof CASH_CASE_STATUSES)[number];
export const CASH_CASE_STATUS_LABEL: Record<CashCaseStatus, string> = {
  OPEN: 'Шийдвэрлээгүй',
  PENDING_DEDUCTION: 'Цалингаас суутгахаар',
  RESOLVED: 'Шийдвэрлэсэн',
};

export const CASH_CASE_RESOLUTIONS = ['RECOVERED_CASH', 'DEDUCT_SALARY', 'WRITE_OFF', 'OVERAGE_INCOME'] as const;
export type CashCaseResolution = (typeof CASH_CASE_RESOLUTIONS)[number];
export const CASH_CASE_RESOLUTION_LABEL: Record<CashCaseResolution, string> = {
  RECOVERED_CASH: 'Бэлнээр нөхсөн',
  DEDUCT_SALARY: 'Цалингаас суутгах',
  WRITE_OFF: 'Акт — компани хүлээв',
  OVERAGE_INCOME: 'Илүүдэл → бусад орлого',
};

/** Ажилтан өөрөө шийдвэрлэх боломжтой (кассчинд хариуцуулах) шийдлүүд. */
export const SHORTAGE_RESOLUTIONS = ['RECOVERED_CASH', 'DEDUCT_SALARY', 'WRITE_OFF'] as const;

export const resolveCashCaseSchema = z
  .object({
    resolution: z.enum(SHORTAGE_RESOLUTIONS),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.resolution !== 'WRITE_OFF' || (v.note?.length ?? 0) >= 3, {
    message: 'Акт (compани хүлээх)-д шалтгаан заавал',
    path: ['note'],
  });
export type ResolveCashCaseInput = z.infer<typeof resolveCashCaseSchema>;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD хэлбэртэй байх ёстой');

export const cashCaseQuerySchema = z.object({
  status: z.enum(CASH_CASE_STATUSES).optional(),
  stationId: z.string().optional(),
  employeeId: z.string().optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});
export type CashCaseQuery = z.infer<typeof cashCaseQuerySchema>;

export const cashScorecardQuerySchema = z.object({
  stationId: z.string().optional(),
  from: ymd,
  to: ymd,
});
export type CashScorecardQuery = z.infer<typeof cashScorecardQuerySchema>;

/** Зөрүүний төрөл. */
export type VarianceKind = 'SHORTAGE' | 'OVERAGE' | 'NONE';
export function varianceKind(varianceMnt: bigint): VarianceKind {
  if (varianceMnt < 0n) return 'SHORTAGE';
  if (varianceMnt > 0n) return 'OVERAGE';
  return 'NONE';
}

/** Дутагдлын үлдэгдэл (нөхөгдөөгүй хэсэг). */
export function outstandingMnt(amountMnt: bigint, recoveredMnt: bigint): bigint {
  const left = amountMnt - recoveredMnt;
  return left > 0n ? left : 0n;
}

export interface DeductibleCase {
  id: string;
  amountMnt: bigint;
  recoveredMnt: bigint;
}
export interface DeductionAllocation {
  caseId: string;
  deductMnt: bigint;
  fullySettled: boolean;
}

/**
 * Цалингаас суутгах хуваарилалт — гарт олгох дүнгээс ХЭТРЭХГҮЙ (сөрөг цалин гарахгүй).
 * Хуучин хэргээс эхлэн (дарааллаар) хэсэгчлэн суутгана; үлдсэн нь дараагийн сард шилжинэ.
 */
export function allocateDeductions(
  availableNetMnt: bigint,
  cases: DeductibleCase[],
): { allocations: DeductionAllocation[]; totalMnt: bigint } {
  let available = availableNetMnt > 0n ? availableNetMnt : 0n;
  const allocations: DeductionAllocation[] = [];
  let total = 0n;
  for (const c of cases) {
    if (available <= 0n) break;
    const left = outstandingMnt(c.amountMnt, c.recoveredMnt);
    if (left <= 0n) continue;
    const take = left < available ? left : available;
    available -= take;
    total += take;
    allocations.push({ caseId: c.id, deductMnt: take, fullySettled: take === left });
  }
  return { allocations, totalMnt: total };
}
