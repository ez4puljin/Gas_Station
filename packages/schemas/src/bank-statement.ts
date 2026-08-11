import { z } from 'zod';

/**
 * Банкны хуулга — задлан унших цэвэр логик + орц/гарцын схем.
 *
 * Файлыг ХӨТӨЧ дээр задална (apps/web дахь exceljs) — энд зөвхөн мөрүүдийг
 * (нүдний массив) утга болгон хөрвүүлэх ЦЭВЭР функцууд байна. Ингэснээр
 * шинэ dependency нэмэхгүй, логик нь тестлэгдэнэ (§13).
 *
 * Мөнгө = integer MNT (§2.1). Банкны файлд аравтын орон байвал ойролцоо
 * бүхэл төгрөг болгоно.
 */

// ── Таних дүрмүүд ──────────────────────────────────────────────
const FEE_KEYWORDS = ['хураамж', 'шимтгэл', 'commission', 'fee', 'үйлчилгээний төлбөр'];
/** ПОС-ын өдрийн тооцоо — Хаанбанк тайлбарт "SETTLEMENT" гэж бичдэг. */
const SETTLEMENT_RE = /\bSETTLEMENT\b/i;

const DATE_YMD_RE = /\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/;
const DATE_DMY_RE = /\b(\d{1,2})[-./](\d{1,2})[-./](\d{4})\b/;

/** Банкны шимтгэлийн мөр эсэх. */
export function isFeeDescription(desc: string): boolean {
  const d = (desc || '').toLowerCase();
  return FEE_KEYWORDS.some((k) => d.includes(k));
}

/** ПОС-ын тооцооны орлого эсэх. */
export function isPosSettlement(desc: string): boolean {
  return !!desc && SETTLEMENT_RE.test(desc);
}

function makeUtcDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

/** Бичвэрээс огноо ялгана (YYYY-MM-DD эсвэл DD/MM/YYYY). Олдохгүй бол null. */
export function extractDate(text: string): Date | null {
  if (!text) return null;
  const ymd = DATE_YMD_RE.exec(text);
  if (ymd) {
    const d = makeUtcDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (d) return d;
  }
  // Монголд DD/MM/YYYY түгээмэл
  const dmy = DATE_DMY_RE.exec(text);
  if (dmy) {
    const d = makeUtcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    if (d) return d;
  }
  return null;
}

/**
 * Банкны дүнг integer MNT болгоно. Аравтын орныг ойролцоо бүхэл рүү (half-up),
 * сөрөг утгыг абсолютаар (зарим хуулгад дебит сөрөгөөр ирдэг).
 */
export function toMntAmount(v: unknown): bigint {
  if (v === null || v === undefined || v === '') return 0n;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s,'₮]/g, ''));
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(Math.abs(n)));
}

/** Харьцсан дансыг цэвэрлэнэ: "5303363476.0" → "5303363476" */
export function cleanCounterpart(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'nan') return '';
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) ? String(n) : s;
}

/** Файлын нэрнээс данс/валют: `Statement_MNT_5301234567.xlsx` */
export function parseFilename(filename: string): { accountNumber: string; currency: string } {
  const m = /Statement_([A-Z]+)_(\d+)/i.exec(filename || '');
  return m ? { currency: (m[1] ?? 'MNT').toUpperCase(), accountNumber: m[2] ?? '' } : { currency: 'MNT', accountNumber: '' };
}

export interface BankColumnMap {
  date: number;
  debit: number;
  credit: number;
  desc: number;
  counterpart: number;
  headerRow: number;
}

/**
 * Гарчгийн мөрийг сканнердаж баганын индексийг олно — банк бүр багана солин
 * гаргадаг тул байрлалд найдахгүй. Дебит+Кредит хоёулаа олдвол гарчиг гэж үзнэ.
 */
export function detectColumns(rows: unknown[][]): BankColumnMap {
  const fallback: BankColumnMap = { date: 0, debit: 3, credit: 4, desc: 6, counterpart: 7, headerRow: 1 };
  for (let hr = 0; hr < Math.min(4, rows.length); hr++) {
    const header = rows[hr] ?? [];
    const found: Partial<BankColumnMap> = {};
    header.forEach((val, idx) => {
      if (typeof val !== 'string') return;
      const s = val.trim().toLowerCase();
      if (!s) return;
      if (s.includes('дебит') || s.includes('debit')) found.debit = idx;
      else if (s.includes('кредит') || s.includes('credit')) found.credit = idx;
      else if ((s.includes('огноо') && (s.includes('гүйлгээ') || idx <= 1)) || s === 'date') {
        if (found.date === undefined) found.date = idx;
      } else if (s.includes('утга') || s.includes('тайлбар') || s.includes('description')) {
        found.desc = idx;
      } else if ((s.includes('харьцсан') && s.includes('данс')) || s.includes('counterparty')) {
        found.counterpart = idx;
      }
    });
    if (found.debit !== undefined && found.credit !== undefined) return { ...fallback, ...found, headerRow: hr };
  }
  return fallback;
}

export interface ParsedBankTxn {
  txnDate: string; // YYYY-MM-DD
  debitMnt: string; // мөнгө ГАРСАН
  creditMnt: string; // мөнгө ОРСОН
  bankDescription: string;
  bankCounterpart: string;
  isFee: boolean;
  isSettlement: boolean;
}

function cellToDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const fromText = extractDate(s);
  if (fromText) return fromText;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Хуулгын мөрүүдийг (нүдний массив) гүйлгээ болгон хөрвүүлнэ.
 * Огноо танигдахгүй мөр ба "Нийт" нийлбэрийн мөрийг алгасна.
 */
export function parseBankRows(rows: unknown[][]): { transactions: ParsedBankTxn[]; columns: BankColumnMap } {
  const cols = detectColumns(rows);
  const transactions: ParsedBankTxn[] = [];

  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const first = row[cols.date];
    if (first === null || first === undefined) continue;
    const firstStr = String(first).trim();
    if (!firstStr || firstStr.startsWith('Нийт')) continue;

    const txnDate = cellToDate(first);
    if (!txnDate) continue; // огноогүй бол гүйлгээний мөр биш

    let desc = '';
    const raw = row[cols.desc];
    if (raw !== null && raw !== undefined) {
      desc = String(raw).trim();
      if (desc.toLowerCase() === 'nan') desc = '';
    }

    transactions.push({
      txnDate: txnDate.toISOString().slice(0, 10),
      debitMnt: toMntAmount(row[cols.debit]).toString(),
      creditMnt: toMntAmount(row[cols.credit]).toString(),
      bankDescription: desc,
      bankCounterpart: cleanCounterpart(row[cols.counterpart]),
      isFee: isFeeDescription(desc),
      isSettlement: isPosSettlement(desc),
    });
  }
  return { transactions, columns: cols };
}

/** Хуулгын нийт орлого/зарлага (тулгалтад). */
export function sumBankTxns(txns: { debitMnt: string; creditMnt: string }[]): { debitMnt: bigint; creditMnt: bigint } {
  return txns.reduce(
    (a, t) => ({ debitMnt: a.debitMnt + BigInt(t.debitMnt || '0'), creditMnt: a.creditMnt + BigInt(t.creditMnt || '0') }),
    { debitMnt: 0n, creditMnt: 0n },
  );
}

// ── Тохируулгын төрөл ──────────────────────────────────────────
export const BANK_MATCH_TYPES = ['CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'GL_ENTRY', 'IGNORED'] as const;
export type BankMatchType = (typeof BANK_MATCH_TYPES)[number];
export const BANK_MATCH_LABEL: Record<BankMatchType, string> = {
  CUSTOMER_PAYMENT: 'Харилцагчийн төлбөр',
  SUPPLIER_PAYMENT: 'Нийлүүлэгчид төлсөн',
  GL_ENTRY: 'Дансны бичилт',
  IGNORED: 'Тооцохгүй',
};

// ── Zod ────────────────────────────────────────────────────────
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD хэлбэртэй байх ёстой');
const mnt = z.string().regex(/^\d+$/, 'Мөнгөн дүн бүхэл байх ёстой');

export const importBankStatementSchema = z.object({
  accountNumber: z.string().trim().min(1, 'Дансны дугаар шаардлагатай').max(50),
  currency: z.string().trim().max(8).default('MNT'),
  filename: z.string().trim().max(260).default(''),
  dateFrom: ymd.nullish(),
  dateTo: ymd.nullish(),
  /** Энэ банкны данс GL-ийн аль данстай тохирох (өгөгдмөл 1110 Харилцах). */
  glAccountCode: z.string().trim().max(20).default('1110'),
  transactions: z
    .array(
      z.object({
        txnDate: ymd,
        debitMnt: mnt,
        creditMnt: mnt,
        bankDescription: z.string().max(1000).default(''),
        bankCounterpart: z.string().max(100).default(''),
        isFee: z.boolean().default(false),
        isSettlement: z.boolean().default(false),
      }),
    )
    .min(1, 'Гүйлгээ олдсонгүй')
    .max(5000),
});
export type ImportBankStatementInput = z.infer<typeof importBankStatementSchema>;

export const updateBankTxnSchema = z
  .object({
    matchType: z.enum(BANK_MATCH_TYPES).nullish(),
    description: z.string().trim().max(500).optional(),
    customerId: z.string().nullish(),
    supplierId: z.string().nullish(),
    accountCode: z.string().trim().max(20).nullish(),
  })
  .refine((v) => v.matchType !== 'CUSTOMER_PAYMENT' || !!v.customerId, { message: 'Харилцагч сонгоно уу', path: ['customerId'] })
  .refine((v) => v.matchType !== 'SUPPLIER_PAYMENT' || !!v.supplierId, { message: 'Нийлүүлэгч сонгоно уу', path: ['supplierId'] })
  .refine((v) => v.matchType !== 'GL_ENTRY' || !!v.accountCode, { message: 'Данс сонгоно уу', path: ['accountCode'] });
export type UpdateBankTxnInput = z.infer<typeof updateBankTxnSchema>;

export const bankStatementQuerySchema = z.object({
  accountNumber: z.string().optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});
export type BankStatementQuery = z.infer<typeof bankStatementQuerySchema>;
