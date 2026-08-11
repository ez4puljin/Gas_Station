import type { BankMatchType, ParsedBankTxn } from '@fuel/schemas';
import { parseBankRows, parseFilename } from '@fuel/schemas';
import { apiFetch } from './api';

export interface BankStatementRow {
  id: string;
  accountNumber: string;
  currency: string;
  dateFrom: string | null;
  dateTo: string | null;
  filename: string;
  glAccountCode: string;
  createdAt: string;
  txnCount: number;
  postedCount: number;
}

export interface BankTxn {
  id: string;
  txnDate: string;
  debitMnt: string;
  creditMnt: string;
  bankDescription: string;
  bankCounterpart: string;
  isFee: boolean;
  isSettlement: boolean;
  matchType: BankMatchType | null;
  description: string;
  customerId: string | null;
  supplierId: string | null;
  accountCode: string | null;
  postedAt: string | null;
  journalEntryId: string | null;
  customer: { id: string; name: string; code: string | null } | null;
  supplier: { id: string; name: string } | null;
}

export interface BankStatementDetail extends Omit<BankStatementRow, 'txnCount' | 'postedCount'> {
  transactions: BankTxn[];
  totals: { debitMnt: string; creditMnt: string; postedCount: number; matchedCount: number };
}

function qs(o: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const bankApi = {
  list: (q: { accountNumber?: string; from?: string; to?: string } = {}) =>
    apiFetch<BankStatementRow[]>(`/bank-statements${qs(q)}`),
  get: (id: string) => apiFetch<BankStatementDetail>(`/bank-statements/${id}`),
  import: (body: unknown) =>
    apiFetch<BankStatementDetail>('/bank-statements/import', { method: 'POST', body: JSON.stringify(body) }),
  updateTxn: (txnId: string, body: unknown) =>
    apiFetch<BankTxn>(`/bank-statements/transactions/${txnId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  post: (id: string) =>
    apiFetch<{ posted: number; skipped: number; total: number }>(`/bank-statements/${id}/post`, { method: 'POST' }),
  remove: (id: string) => apiFetch(`/bank-statements/${id}`, { method: 'DELETE' }),
};

export interface ParsedStatementFile {
  accountNumber: string;
  currency: string;
  filename: string;
  dateFrom: string | null;
  dateTo: string | null;
  transactions: ParsedBankTxn[];
}

/**
 * Excel хуулгыг ХӨТӨЧ дээр задлана — exceljs аль хэдийн байгаа тул сервер талд
 * шинэ сан нэмэх шаардлагагүй. Задлах ЛОГИК нь `@fuel/schemas`-д (тестлэгдсэн).
 */
export async function parseStatementFile(file: File): Promise<ParsedStatementFile> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel файлд хуудас олдсонгүй');

  // Мөрүүдийг нүдний массив болгож хөрвүүлнэ (exceljs 1-ээс эхэлдэг).
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const vals = row.values as unknown[]; // [0] нь үргэлж хоосон
    rows.push(vals.slice(1));
  });

  const { accountNumber, currency } = parseFilename(file.name);
  const { transactions } = parseBankRows(rows);

  // Хуулгын хамрах хугацааг гүйлгээнүүдээс тодорхойлно (файлын толгойгоос найдвартай).
  const dates = transactions.map((t) => t.txnDate).sort();
  return {
    accountNumber,
    currency,
    filename: file.name,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
    transactions,
  };
}
