import { apiFetch } from './api';

export interface Customer {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  regNo?: string | null;
  address?: string | null;
  creditLimitMnt: string;
  balanceMnt: string;
  isActive: boolean;
}

export interface CustomerTxn {
  id: string;
  type: 'CREDIT_SALE' | 'PAYMENT' | 'ADJUSTMENT';
  amountMnt: string;
  balanceAfterMnt: string;
  method?: string | null;
  reason?: string | null;
  saleId?: string | null;
  createdAt: string;
}

export interface Receivables {
  count: number;
  totalReceivableMnt: string;
  totalPayableMnt: string;
  customers: Customer[];
}

export interface LedgerGoodsItem {
  itemType: 'FUEL' | 'PRODUCT';
  name: string;
  sku: string | null;
  quantity: string;
  unit: string;
  unitCostMnt: string;
  totalCostMnt: string;
}

export interface LedgerEntry {
  id: string;
  createdAt: string;
  type: 'CREDIT_SALE' | 'PAYMENT' | 'ADJUSTMENT';
  method: string | null;
  reason: string | null;
  saleId: string | null;
  saleNumber: string | null;
  debitMnt: string;
  creditMnt: string;
  balanceAfterMnt: string;
  items: LedgerGoodsItem[];
}
export interface Ledger {
  from: string;
  to: string;
  companyName: string | null;
  customer: { id: string; code: string | null; name: string; regNo: string | null; phone: string | null };
  openingMnt: string;
  totalDebitMnt: string;
  totalCreditMnt: string;
  closingMnt: string;
  entries: LedgerEntry[];
}

export const customersApi = {
  list: (search?: string) =>
    apiFetch<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  get: (id: string) => apiFetch<Customer>(`/customers/${id}`),
  create: (body: unknown) =>
    apiFetch<Customer>('/customers', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: unknown) =>
    apiFetch<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transactions: (id: string) =>
    apiFetch<{ items: CustomerTxn[]; total: number }>(`/customers/${id}/transactions`),
  ledger: (id: string, from: string, to: string) =>
    apiFetch<Ledger>(`/customers/${id}/ledger?from=${from}&to=${to}`),
  pay: (id: string, body: unknown) =>
    apiFetch(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  adjust: (id: string, body: unknown) =>
    apiFetch(`/customers/${id}/adjustments`, { method: 'POST', body: JSON.stringify(body) }),
  receivables: () => apiFetch<Receivables>('/customers/receivables'),
};
