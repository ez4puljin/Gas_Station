import type { Mnt } from '@fuel/types';
import { divRoundHalfUp } from './money';

/**
 * Тоо хэмжээ (литр, ширхэг) — 3 оронтой нарийвчлалтай integer "milli" нэгжээр
 * BigInt дээр тооцоолно (float ашиглахгүй — §2.1-тэй уялдуулсан).
 */
const MILLI = 1000n;

/** "12.5" | 12.5 | "12.500" → 12500n (milli). 3-аас илүү бутархайг татгалзана. */
export function toMilliUnits(value: number | string): bigint {
  const str = typeof value === 'number' ? value.toString() : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(str);
  if (!match) throw new Error(`Буруу тоо хэмжээ: "${value}"`);
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] ?? '0');
  const frac = (match[3] ?? '').padEnd(3, '0');
  return sign * (whole * MILLI + BigInt(frac));
}

/** milli → Decimal string (Prisma Decimal талбарт хадгалахад). */
export function milliToDecimalString(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const whole = abs / MILLI;
  const frac = (abs % MILLI).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Мөрийн дүн: нэгж үнэ (MNT, bigint) × тоо хэмжээ (milli) → бүхэл MNT (half-up). */
export function lineTotalMnt(unitPriceMnt: bigint, qtyMilli: bigint): Mnt {
  return divRoundHalfUp(unitPriceMnt * qtyMilli, MILLI) as Mnt;
}
