import { apiFetch } from './api';

/** undefined талбаруудыг хасаж query string болгоно. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── Борлуулалтын тайлан ──
export interface SalesReportLine {
  type: 'FUEL' | 'PRODUCT';
  name: string;
  grade: string | null;
  quantity: string;
  unitPriceMnt: string;
  lineTotalMnt: string;
}
export interface SalesReportRow {
  id: string;
  saleNumber: string | null;
  stationLabel: string | null;
  soldAt: string;
  status: string;
  cashierName: string | null;
  customerName: string | null;
  subtotalMnt: string;
  vatMnt: string;
  totalMnt: string;
  methods: { method: string; amountMnt: string }[];
  lines: SalesReportLine[];
}
export interface SalesReport {
  from: string;
  to: string;
  truncated: boolean;
  totals: { count: number; grossMnt: string; vatMnt: string; netMnt: string; refundsMnt: string; netAfterRefundsMnt: string };
  byGrade: { grade: string; liters: string; amountMnt: string }[];
  byProduct: { product: string; quantity: string; amountMnt: string }[];
  byMethod: Record<string, string>;
  byCustomer: { customer: string; amountMnt: string }[];
  items: SalesReportRow[];
}

export interface VatReport {
  from: string;
  to: string;
  stationId: string | null;
  salesCount: number;
  grossMnt: string;
  vatableGrossMnt: string;
  vatableNetMnt: string;
  exemptGrossMnt: string;
  outputVatMnt: string;
  refundVatMnt: string;
  refundGrossMnt: string;
  netVatMnt: string;
}

export interface ShiftHistoryRow {
  id: string;
  stationId: string;
  stationLabel: string | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  cashiers: string[];
  openingCashMnt: string;
  closingCashMnt: string | null;
  expectedCashMnt: string | null;
  varianceMnt: string | null;
  salesCount: number;
  salesTotalMnt: string;
}
export interface ShiftHistory {
  from: string;
  to: string;
  shifts: ShiftHistoryRow[];
}

export interface ZReport {
  shift: {
    id: string;
    stationLabel: string | null;
    status: string;
    openedAt: string;
    openApprovedAt: string | null;
    closeRequestedAt: string | null;
    closedAt: string | null;
    note: string | null;
    openingCashMnt: string;
    closingCashMnt: string | null;
    expectedCashMnt: string | null;
  };
  cashiers: string[];
  tenders: { method: string; declaredMnt: string; expectedMnt: string; varianceMnt: string }[];
  tankReadings: { tankCode: string; phase: string; centimeters: string; liters: string | null }[];
  sales: { count: number; grossMnt: string; vatMnt: string };
  byMethod: Record<string, string>;
  fuelByGrade: { grade: string | null; liters: string; amountMnt: string }[];
  refunds: { count: number; amountMnt: string };
  reconciliation: { expectedCashMnt: string; countedCashMnt: string; varianceMnt: string; note: string | null } | null;
}

export interface DeliveriesReport {
  from: string;
  to: string;
  totals: { count: number; liters: string; totalCostMnt: string };
  byGrade: { grade: string; liters: string; costMnt: string }[];
  bySupplier: { supplier: string; liters: string; costMnt: string }[];
  items: {
    id: string;
    receivedAt: string;
    stationLabel: string;
    grade: string;
    tankCode: string | null;
    supplier: string | null;
    documentNo: string | null;
    liters: string;
    unitCostMnt: string;
    totalCostMnt: string;
  }[];
}

export interface Valuation {
  stationId: string;
  products: { productId: string; name: string; sku: string; unit: string; quantity: string; unitCostMnt: string; valueMnt: string }[];
  fuelTanks: { tankId: string; code: string; grade: string; currentLiters: string; valueMnt: string; costBasis: string }[];
  totals: { productValueMnt: string; fuelValueMnt: string; totalValueMnt: string };
}

export interface MovementReport {
  from: string;
  to: string;
  stationId: string;
  count: number;
  byType: Record<string, number>;
  items: {
    id: string;
    createdAt: string;
    type: string;
    product: string | null;
    fuelTankId: string | null;
    quantity: string;
    unitCostMnt: string | null;
    reason: string | null;
    refType: string | null;
    refId: string | null;
  }[];
}

export interface FuelRecon {
  from: string;
  to: string;
  stationId: string;
  tanks: {
    tankId: string;
    code: string;
    grade: string;
    currentLiters: string;
    delivered: string;
    dispensed: string;
    returned: string;
    adjusted: string;
    netChange: string;
  }[];
}

export interface MarginReport {
  stationId: string;
  from: string;
  to: string;
  rows: { grade: string | null; liters: string; revenueMnt: string; cogsMnt: string | null; marginMnt: string | null; marginPct: number | null; costBasis: string }[];
}

type RangeFilters = {
  from: string;
  to: string;
  stationId?: string;
  cashierId?: string;
  customerId?: string;
  fuelGradeId?: string;
  productId?: string;
  method?: string;
  status?: string;
  search?: string;
};

export const reportsApi = {
  salesReport: (f: RangeFilters) => apiFetch<SalesReport>(`/finance/sales-report${qs(f)}`),
  vat: (f: { from: string; to: string; stationId?: string }) => apiFetch<VatReport>(`/finance/vat${qs(f)}`),
  margin: (stationId: string, from: string, to: string) =>
    apiFetch<MarginReport>(`/finance/margin${qs({ stationId, from, to })}`),
  shiftHistory: (f: { from: string; to: string; stationId?: string; cashierId?: string }) =>
    apiFetch<ShiftHistory>(`/staff/shifts/history${qs(f)}`),
  zReport: (shiftId: string) => apiFetch<ZReport>(`/staff/shifts/${shiftId}/z-report`),
  deliveries: (f: { from: string; to: string; stationId?: string; supplierId?: string; fuelGradeId?: string }) =>
    apiFetch<DeliveriesReport>(`/inventory/reports/deliveries${qs(f)}`),
  valuation: (stationId: string) => apiFetch<Valuation>(`/inventory/reports/valuation${qs({ stationId })}`),
  movements: (f: { stationId: string; from: string; to: string; type?: string; productId?: string }) =>
    apiFetch<MovementReport>(`/inventory/reports/movements${qs(f)}`),
  fuelRecon: (f: { stationId: string; from: string; to: string }) =>
    apiFetch<FuelRecon>(`/inventory/reports/fuel-recon${qs(f)}`),
};
