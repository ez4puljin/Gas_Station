import { z } from 'zod';

/**
 * Чөлөө (leave) — хүсэлт→батлах урсгал, хоногийн тооцоо, үлдэгдэл.
 * Хоног = хуанлийн өдөр (хоёр захыг оруулж). Ажлын өдрөөр тооцох сонголтыг ирээдүйд нэмж болно.
 */

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: 'Ээлжийн амралт',
  SICK: 'Өвчний чөлөө',
  UNPAID: 'Цалингүй чөлөө',
  OTHER: 'Бусад',
};

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Хүлээгдэж буй',
  APPROVED: 'Зөвшөөрсөн',
  REJECTED: 'Татгалзсан',
  CANCELLED: 'Цуцалсан',
};

/** МУ-ын хөдөлмөрийн хууль: ээлжийн амралт жилд хамгийн багадаа 15 ажлын өдөр. */
export const DEFAULT_ANNUAL_LEAVE_DAYS = 15;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD хэлбэртэй байх ёстой');

export const leaveRequestSchema = z
  .object({
    employeeId: z.string().min(1),
    type: z.enum(LEAVE_TYPES),
    startDate: ymd,
    endDate: ymd,
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'Дуусах огноо эхлэхээс хойш байх ёстой', path: ['endDate'] });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const leaveRejectSchema = z.object({ note: z.string().trim().max(500).optional() });
export type LeaveRejectInput = z.infer<typeof leaveRejectSchema>;

export const leaveQuerySchema = z.object({
  status: z.enum(LEAVE_STATUSES).optional(),
  employeeId: z.string().optional(),
  from: ymd.optional(),
  to: ymd.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LeaveQuery = z.infer<typeof leaveQuerySchema>;

/** Чөлөөний хоног — хуанлийн өдөр, хоёр захыг оруулж. end < start бол алдаа. */
export function countLeaveDays(startYmd: string, endYmd: string): number {
  const s = Date.parse(`${startYmd}T00:00:00Z`);
  const e = Date.parse(`${endYmd}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) throw new Error('Огноо буруу');
  if (e < s) throw new Error('Дуусах огноо эхлэхээс өмнө байна');
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Хоёр хаалттай муж огтлолцож байгаа эсэх (огноо мөртэй). */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
