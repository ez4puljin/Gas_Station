import { apiFetch } from './api';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalSide: 'DEBIT' | 'CREDIT';
  parentId: string | null;
  isPostable: boolean;
  isActive: boolean;
  currency: string;
  journalName: string | null;
  stationId: string | null;
  station?: { id: string; code: string; name: string } | null;
}

export interface JournalLine {
  id: string;
  accountId: string;
  debitMnt: string;
  creditMnt: string;
  memo: string | null;
  account?: { code: string; name: string };
}
export interface JournalEntry {
  id: string;
  entryNo: string;
  date: string;
  source: string;
  memo: string | null;
  stationId: string | null;
  reversedId: string | null;
  lines: JournalLine[];
}

export interface JournalLineInput {
  accountCode: string;
  debitMnt?: string;
  creditMnt?: string;
  stationId?: string;
  memo?: string;
}
export interface CreateJournalBody {
  date: string;
  stationId?: string;
  source?: string;
  memo?: string;
  lines: JournalLineInput[];
}

export interface TrialBalance {
  from: string;
  to: string;
  rows: { code: string; name: string; type: string; debitMnt: string; creditMnt: string }[];
  totalDebitMnt: string;
  totalCreditMnt: string;
  balanced: boolean;
}
export interface ProfitLoss {
  from: string;
  to: string;
  revenue: { code: string; name: string; amountMnt: string }[];
  expense: { code: string; name: string; amountMnt: string }[];
  totalRevenueMnt: string;
  totalExpenseMnt: string;
  netIncomeMnt: string;
}
export interface BalanceSheet {
  asOf: string;
  assets: { code: string; name: string; amountMnt: string }[];
  totalAssetsMnt: string;
  liabilities: { code: string; name: string; amountMnt: string }[];
  totalLiabilitiesMnt: string;
  equity: { code: string; name: string; amountMnt: string }[];
  netIncomeMnt: string;
  totalEquityMnt: string;
  totalLiabEquityMnt: string;
  balanced: boolean;
}

function qs(f: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const accountingApi = {
  setup: () => apiFetch<{ created: number }>('/accounting/setup', { method: 'POST' }),
  accounts: (q: Record<string, string> = {}) => {
    const p = new URLSearchParams(q).toString();
    return apiFetch<Account[]>(`/accounting/accounts${p ? `?${p}` : ''}`);
  },
  createAccount: (body: unknown) => apiFetch<Account>('/accounting/accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateAccount: (id: string, body: unknown) => apiFetch<Account>(`/accounting/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: (id: string) => apiFetch<{ deleted: boolean }>(`/accounting/accounts/${id}`, { method: 'DELETE' }),

  journal: (f: { from: string; to: string; stationId?: string; source?: string }) =>
    apiFetch<JournalEntry[]>(`/accounting/journal${qs(f)}`),
  getEntry: (id: string) => apiFetch<JournalEntry>(`/accounting/journal/${id}`),
  createEntry: (body: CreateJournalBody) => apiFetch<JournalEntry>('/accounting/journal', { method: 'POST', body: JSON.stringify(body) }),
  reverse: (id: string) => apiFetch<JournalEntry>(`/accounting/journal/${id}/reverse`, { method: 'POST' }),

  trialBalance: (f: { from: string; to: string; stationId?: string }) => apiFetch<TrialBalance>(`/accounting/trial-balance${qs(f)}`),
  pnl: (f: { from: string; to: string; stationId?: string }) => apiFetch<ProfitLoss>(`/accounting/pnl${qs(f)}`),
  balanceSheet: (f: { asOf: string; stationId?: string }) => apiFetch<BalanceSheet>(`/accounting/balance-sheet${qs(f)}`),
};
