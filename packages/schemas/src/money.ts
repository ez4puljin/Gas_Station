import { z } from 'zod';
import { CURRENCY_SYMBOL, VAT_RATE_PERCENT, type Mnt } from '@fuel/types';

/**
 * Мөнгөний туслах функцууд — CLAUDE.md §2.1, §14.
 * Бүх дүн БҮХЭЛ bigint (MNT). Гар тооцооллыг эдгээрээр дамжуулна.
 */

/** Дурын орцыг branded bigint (Mnt) болгож хэвийшүүлнэ. Float / бутархайг татгалзана. */
export function toMnt(value: bigint | number | string): Mnt {
  let v: bigint;
  if (typeof value === 'bigint') {
    v = value;
  } else if (typeof value === 'number') {
    // Number.isSafeInteger — бутархайг + 2^53-аас дээш нарийвчлал алдсан тоог татгалзана.
    // Тийм дүнг string эсвэл bigint-ээр дамжуулна (CLAUDE.md §2.1).
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `MNT дүн аюулгүй бүхэл тоо байх ёстой (string/bigint ашиглана уу): ${value}`,
      );
    }
    v = BigInt(value);
  } else {
    const cleaned = value.replace(/[\s,₮]/g, '').trim();
    if (!/^-?\d+$/.test(cleaned)) {
      throw new Error(`Буруу MNT дүн: "${value}"`);
    }
    v = BigInt(cleaned);
  }
  return v as Mnt;
}

/** CLAUDE.md §14-д заасан нэр (parse) */
export const parseMnt = toMnt;

/** Дэлгэцэнд харуулах формат: `1,500 ₮` (CLAUDE.md §12). */
export function formatMnt(
  value: bigint | number | string,
  opts: { symbol?: boolean } = {},
): string {
  const v = toMnt(value);
  const negative = v < 0n;
  const digits = (negative ? -v : v).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '-' : '';
  return opts.symbol === false ? `${sign}${grouped}` : `${sign}${grouped} ${CURRENCY_SYMBOL}`;
}

/** Эерэг бүхэл хуваалт (half-up округление) — bigint дээр. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Хуваагч эерэг байх ёстой');
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator < 0n ? -numerator : numerator;
  return sign * ((abs * 2n + denominator) / (denominator * 2n));
}

/**
 * НӨАТ багтсан (gross) дүнгээс суурь дүн ба НӨАТ-ыг ялгана — CLAUDE.md §12 (10%).
 * gross = net + vat,  vat = gross * rate / (100 + rate)
 */
export function splitVatFromGross(gross: bigint | number | string): { net: Mnt; vat: Mnt } {
  const g = toMnt(gross);
  const vat = divRoundHalfUp(g * BigInt(VAT_RATE_PERCENT), BigInt(100 + VAT_RATE_PERCENT)) as Mnt;
  const net = (g - vat) as Mnt;
  return { net, vat };
}

/** Суурь (net) дүн дээр НӨАТ нэмж gross гаргана. */
export function addVat(net: bigint | number | string): { gross: Mnt; vat: Mnt } {
  const n = toMnt(net);
  const vat = divRoundHalfUp(n * BigInt(VAT_RATE_PERCENT), 100n) as Mnt;
  const gross = (n + vat) as Mnt;
  return { gross, vat };
}

/**
 * Утсаар дамжих мөнгийг хүлээн авах Zod схем.
 * string | number | bigint -> Mnt (bigint). Frontend ихэвчлэн string илгээнэ.
 */
export const mntSchema = z
  .union([
    z.bigint(),
    z.number().int({ message: 'Мөнгөн дүн бүхэл байх ёстой' }),
    z.string().min(1),
  ])
  .transform((val, ctx): Mnt => {
    try {
      return toMnt(val);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Буруу мөнгөн дүн' });
      return z.NEVER;
    }
  });

/** Сөрөг биш мөнгөн дүн (ихэнх борлуулалтын талбар). */
export const mntNonNegativeSchema = mntSchema.refine((v) => v >= 0n, {
  message: 'Мөнгөн дүн сөрөг байж болохгүй',
});

/** Эерэг мөнгөн дүн. */
export const mntPositiveSchema = mntSchema.refine((v) => v > 0n, {
  message: 'Мөнгөн дүн 0-ээс их байх ёстой',
});
