import { z } from 'zod';

/**
 * Цаг бүртгэл (attendance) — орц/гарц схем + ажилласан минутын цэвэр тооцоо.
 * Цаг = бүхэл минут (мөнгө/түлш биш тул milli шаардлагагүй).
 */

const isoDateTime = z.string().datetime({ offset: true });
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD хэлбэртэй байх ёстой');
const note = z.string().trim().max(500).optional();
const breakMinutes = z.number().int().min(0).max(24 * 60).optional();

/** Цаг бүртгэх (clock-in). `at` өгөхгүй бол одоо (буцаагаад бүртгэх боломжтой). */
export const clockInSchema = z.object({
  employeeId: z.string().min(1),
  stationId: z.string().min(1),
  at: isoDateTime.optional(),
  note,
});
export type ClockInInput = z.infer<typeof clockInSchema>;

/** Гаргах (clock-out) — нээлттэй бичлэг дээр. */
export const clockOutSchema = z.object({
  at: isoDateTime.optional(),
  breakMinutes,
  note,
});
export type ClockOutInput = z.infer<typeof clockOutSchema>;

/** Гар бүртгэл/засвар — орц+гарц нэг дор (жишээ нь мартсан бичлэгийг нөхөх). */
export const manualAttendanceSchema = z
  .object({
    employeeId: z.string().min(1),
    stationId: z.string().min(1),
    clockIn: isoDateTime,
    clockOut: isoDateTime,
    breakMinutes,
    note,
  })
  .refine((v) => new Date(v.clockOut).getTime() > new Date(v.clockIn).getTime(), {
    message: 'Гарах цаг орох цагаас хойш байх ёстой',
    path: ['clockOut'],
  });
export type ManualAttendanceInput = z.infer<typeof manualAttendanceSchema>;

/** Лог/нэгтгэлийн муж шүүлт. */
export const attendanceQuerySchema = z.object({
  stationId: z.string().optional(),
  employeeId: z.string().optional(),
  from: ymd,
  to: ymd,
});
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;

/** Бичлэг устгах (засвар) — шалтгаан заавал (§2.7). */
export const attendanceDeleteSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export type AttendanceDeleteInput = z.infer<typeof attendanceDeleteSchema>;

/**
 * Ажилласан минут = (гарах − орох) хамгийн ойрын минут − завсарлага. Сөрөг бол 0.
 * Цэвэр функц — DB/timezone-оос хамаарахгүй (epoch ms-ээр).
 */
export function computeWorkedMinutes(clockInMs: number, clockOutMs: number, breakMin = 0): number {
  const span = Math.round((clockOutMs - clockInMs) / 60_000); // нийт минут
  const worked = span - Math.max(0, Math.trunc(breakMin));
  return worked > 0 ? worked : 0;
}

/** Минутыг "Цаг Ц мин М" хэлбэрт (UI туслах). */
export function formatMinutesHm(min: number): string {
  const m = Math.max(0, Math.trunc(min));
  const h = Math.trunc(m / 60);
  const r = m % 60;
  if (h && r) return `${h}ц ${r}м`;
  if (h) return `${h}ц`;
  return `${r}м`;
}
