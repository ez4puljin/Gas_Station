import { apiFetch } from './api';

// ── Нийлүүлэгч (Supplier) + өглөг (AP) ──
export interface Supplier {
  id: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  regNo?: string | null;
  balanceMnt: string; // өглөг (AP): эерэг = бид өртэй
  isActive: boolean;
}

export interface SupplierTxn {
  id: string;
  type: 'RECEIPT' | 'PAYMENT' | 'ADJUSTMENT';
  amountMnt: string;
  balanceAfterMnt: string;
  method?: string | null;
  reason?: string | null;
  purchaseId?: string | null;
  createdAt: string;
}

export interface Payables {
  count: number;
  totalPayableMnt: string;
  suppliers: Supplier[];
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

export interface SupplierLedgerEntry {
  id: string;
  createdAt: string;
  type: 'RECEIPT' | 'PAYMENT' | 'ADJUSTMENT';
  method: string | null;
  reason: string | null;
  purchaseId: string | null;
  purchaseNo: string | null;
  debitMnt: string;
  creditMnt: string;
  balanceAfterMnt: string;
  items: LedgerGoodsItem[];
}
export interface SupplierLedger {
  from: string;
  to: string;
  companyName: string | null;
  supplier: { id: string; name: string; regNo: string | null; phone: string | null };
  openingMnt: string;
  totalDebitMnt: string;
  totalCreditMnt: string;
  closingMnt: string;
  entries: SupplierLedgerEntry[];
}

// ── Худалдан авалт (Purchase) ──
export type PurchaseLineStatusT = 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseLine {
  id: string;
  stationId: string;
  stationLabel: string;
  itemType: 'FUEL' | 'PRODUCT';
  status: PurchaseLineStatusT;
  fuelGradeId: string | null;
  gradeLabel: string | null;
  tankId: string | null;
  tankCode: string | null;
  productId: string | null;
  productName: string | null;
  unit: string | null;
  quantity: string;
  unitCostMnt: string;
  totalCostMnt: string;
  receivedAt: string | null;
}

export interface Purchase {
  id: string;
  purchaseNo: string | null;
  documentNo: string | null;
  note: string | null;
  supplierId: string;
  supplierName: string;
  totalCostMnt: string;
  createdAt: string;
  lineCount: number;
  receivedCount: number;
  cancelledCount: number;
  pendingCount: number;
  status: 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  lines: PurchaseLine[];
}

export interface PurchaseLineInput {
  stationId: string;
  itemType: 'FUEL' | 'PRODUCT';
  fuelGradeId?: string;
  tankId?: string;
  productId?: string;
  quantity: string;
  unitCostMnt: string;
}
export interface CreatePurchaseBody {
  supplierId: string;
  documentNo?: string;
  note?: string;
  lines: PurchaseLineInput[];
}

export interface PurchaseListFilters {
  supplierId?: string;
  stationId?: string;
  status?: PurchaseLineStatusT;
  from?: string;
  to?: string;
}

function qs(f: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const procurementApi = {
  // Нийлүүлэгч
  suppliers: () => apiFetch<Supplier[]>('/suppliers'),
  supplier: (id: string) => apiFetch<Supplier>(`/suppliers/${id}`),
  createSupplier: (body: unknown) =>
    apiFetch<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(body) }),
  updateSupplier: (id: string, body: unknown) =>
    apiFetch<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSupplier: (id: string) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
  supplierTxns: (id: string) =>
    apiFetch<{ items: SupplierTxn[]; total: number }>(`/suppliers/${id}/transactions`),
  supplierLedger: (id: string, from: string, to: string) =>
    apiFetch<SupplierLedger>(`/suppliers/${id}/ledger?from=${from}&to=${to}`),
  pay: (id: string, body: unknown) =>
    apiFetch(`/suppliers/${id}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  adjust: (id: string, body: unknown) =>
    apiFetch(`/suppliers/${id}/adjustments`, { method: 'POST', body: JSON.stringify(body) }),
  payables: () => apiFetch<Payables>('/suppliers/payables'),

  // Худалдан авалт
  purchases: (f: PurchaseListFilters = {}) =>
    apiFetch<Purchase[]>(`/purchases${qs(f as Record<string, string | undefined>)}`),
  purchase: (id: string) => apiFetch<Purchase>(`/purchases/${id}`),
  createPurchase: (body: CreatePurchaseBody) =>
    apiFetch<Purchase>('/purchases', { method: 'POST', body: JSON.stringify(body) }),
  receiveLine: (purchaseId: string, lineId: string, body: { documentNo?: string } = {}) =>
    apiFetch<unknown>(`/purchases/${purchaseId}/lines/${lineId}/receive`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelLine: (purchaseId: string, lineId: string) =>
    apiFetch<unknown>(`/purchases/${purchaseId}/lines/${lineId}/cancel`, { method: 'POST' }),
};
