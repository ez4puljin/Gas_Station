import type { PaymentMethod } from '@fuel/types';
import { apiFetch } from './api';
import { cachedFetch } from './request-cache';

export interface StationDto {
  id: string;
  code: string;
  name: string;
  address?: string | null;
}

export interface FuelCatalogItem {
  fuelGradeId: string;
  code: string;
  name: string;
  pricePerLiterMnt: string; // BigInt → string
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category: string; // бараа материалын ангилал (масло, тосол г.м)
  priceMnt: string;
  isVatable: boolean;
}

export interface CatalogDto {
  fuels: FuelCatalogItem[];
  products: ProductCatalogItem[];
}

export interface ShiftDto {
  id: string;
  stationId: string;
  status: string; // PENDING_OPEN | OPEN | PENDING_CLOSE | CLOSED
  openingCashMnt: string;
  openedAt: string;
}

export interface SaleLineDto {
  id: string;
  description: string;
  quantity: string;
  unitPriceMnt: string;
  lineTotalMnt: string;
}

export interface SalePaymentDto {
  method: PaymentMethod;
  amountMnt: string;
  maskedPan?: string | null;
}

export interface SaleDto {
  id: string;
  subtotalMnt: string;
  vatMnt: string;
  totalMnt: string;
  soldAt: string;
  lines: SaleLineDto[];
  payments?: SalePaymentDto[];
}

// ── Борлуулалтын түүх / дэлгэрэнгүй / буцаалт ──
export interface SalesListFilters {
  page?: number;
  pageSize?: number;
  stationId?: string;
  from?: string;
  to?: string;
  cashierId?: string;
  customerId?: string;
  method?: string;
  fuelGradeId?: string;
  productId?: string;
  status?: string;
  search?: string;
}

export interface SaleListItem {
  id: string;
  saleNumber: string | null;
  stationId: string;
  stationLabel: string | null;
  soldAt: string;
  status: string;
  cashierId: string;
  cashierName: string | null;
  customerId: string | null;
  customerName: string | null;
  subtotalMnt: string;
  vatMnt: string;
  totalMnt: string;
  refundedMnt: string;
  methods: { method: PaymentMethod; amountMnt: string }[];
  lineCount: number;
}

export interface SaleDetailLine extends SaleLineDto {
  type: 'FUEL' | 'PRODUCT';
  fuelGradeId: string | null;
  productId: string | null;
  nozzleId: string | null;
  vatMnt: string;
  refundedQty: string;
  unit: string | null; // барааны нэгж (ш, кг...); түлш = л
}
export interface SaleRefund {
  id: string;
  amountMnt: string;
  reason: string;
  createdAt: string;
  lines: { method: PaymentMethod; amountMnt: string }[];
  items: { saleLineId: string; quantity: string; amountMnt: string; fuelGradeId: string | null; productId: string | null }[];
}
export interface SaleDetail {
  id: string;
  saleNumber: string | null;
  stationId: string;
  stationLabel: string | null;
  status: string;
  soldAt: string;
  shiftId: string;
  cashierId: string;
  cashierName: string | null;
  customerId: string | null;
  customerName: string | null;
  customerTin: string | null;
  subtotalMnt: string;
  vatMnt: string;
  totalMnt: string;
  lines: SaleDetailLine[];
  payments: SalePaymentDto[];
  refunds: SaleRefund[];
}

function listQs(f: SalesListFilters): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const posApi = {
  // Салбарууд тогтвортой бөгөөд 16 хуудаснаас дуудагддаг тул кэшлэнэ (admin CRUD-д invalidate).
  stations: () => cachedFetch('stations', () => apiFetch<StationDto[]>('/stations')),
  catalog: (stationId: string) =>
    apiFetch<CatalogDto>(`/pos/catalog?stationId=${encodeURIComponent(stationId)}`),
  currentShift: (stationId: string) =>
    apiFetch<ShiftDto | null>(`/staff/shifts/current?stationId=${encodeURIComponent(stationId)}`),
  // Ээлж нээх/хаах нь батлах урсгалтай тул /staff (Ажилтан/Ээлж) + /control дээр (controlApi)
  createSale: (body: unknown) =>
    apiFetch<SaleDto>('/pos/sales', { method: 'POST', body: JSON.stringify(body) }),

  listSales: (f: SalesListFilters) =>
    apiFetch<{ items: SaleListItem[]; page: number; pageSize: number; total: number; totalPages: number }>(
      `/pos/sales${listQs(f)}`,
    ),
  getSale: (id: string) => apiFetch<SaleDetail>(`/pos/sales/${id}`),
  refund: (id: string, body: { reason: string; items: { saleLineId: string; quantity: string }[]; tenders: { method: string; amount: string }[] }) =>
    apiFetch(`/pos/sales/${id}/refund`, { method: 'POST', body: JSON.stringify(body) }),
  voidSale: (id: string, body: { reason: string }) =>
    apiFetch(`/pos/sales/${id}/void`, { method: 'POST', body: JSON.stringify(body) }),
};
