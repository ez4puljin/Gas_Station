/**
 * Мөнгө — Монгол төгрөг (MNT). CLAUDE.md §2.1 (зөрчиж болохгүй):
 *   • Бүх дүн БҮХЭЛ тоо. Float ХЭЗЭЭ Ч ашиглахгүй.
 *   • Монгол төгрөгт мөнгө (penny) практикт хэрэглэгддэггүй.
 *
 * Хадгалалт: DB-д `BigInt` (PostgreSQL bigint) — Int(32-bit) overflow-оос сэргийлнэ
 *   (нэгдсэн тайлан, нөөцийн дүн 2.1 тэрбумаас давж болзошгүй).
 * Утсаар (JSON): мөнгийг СТRING болгож дамжуулна — нарийвчлал хэзээ ч алдагдахгүй.
 *
 * `Mnt` нь branded bigint — санамсаргүй энгийн тоотой холих эрсдэлийг бууруулна.
 */
export type Mnt = bigint & { readonly __brand: 'MNT' };

/** Литр зэрэг хэмжээг integer "milli" нэгжээр хадгална (3 оронтой нарийвчлал). */
export type MilliUnit = bigint & { readonly __brand: 'MILLI' };

/** НӨАТ хувь — CLAUDE.md §12 (Монгол: 10%) */
export const VAT_RATE_PERCENT = 10 as const;

/** Валютын код / тэмдэг */
export const CURRENCY_CODE = 'MNT' as const;
export const CURRENCY_SYMBOL = '₮' as const;
