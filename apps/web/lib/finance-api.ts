import { apiFetch } from './api';

export interface DailyReport {
  stationId: string;
  date: string;
  salesCount: number;
  grossMnt: string;
  vatMnt: string;
  netMnt: string;
  byMethod: Record<string, string>;
  creditMnt: string; // зээлд бичсэн (авлага)
  collectedMnt: string; // бодит цуглуулсан (бэлэн/карт/мобайл)
  fuelByGrade: { grade: string | null; liters: string; amountMnt: string }[];
  fuelLiters: string;
  productSalesMnt: string;
  refundsMnt: string;
  refundsCount: number;
  voidCount: number;
  netAfterRefundsMnt: string;
}

export interface KpiRow {
  stationId: string;
  code: string | null;
  name: string | null;
  grossMnt: string;
  salesCount: number;
  avgTicketMnt: string;
  fuelLiters: string;
}
export interface KpiReport {
  date: string;
  stations: KpiRow[];
}

export interface AnomalyReport {
  from: string;
  to: string;
  voidCount: number;
  thresholdMnt: string;
  cashVariances: {
    id: string;
    stationId: string;
    shiftId: string;
    expectedCashMnt: string;
    countedCashMnt: string;
    varianceMnt: string;
    createdAt: string;
  }[];
  largeRefunds: {
    id: string;
    saleId: string;
    stationId: string;
    amountMnt: string;
    reason: string;
    createdAt: string;
  }[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const financeApi = {
  daily: (stationId: string, date: string) =>
    apiFetch<DailyReport>(`/finance/daily?stationId=${encodeURIComponent(stationId)}&date=${date}`),
  kpi: (date: string) => apiFetch<KpiReport>(`/finance/kpi?date=${date}`),
  anomalies: (from: string, to: string, stationId?: string) =>
    apiFetch<AnomalyReport>(
      `/finance/anomalies?from=${from}&to=${to}${stationId ? `&stationId=${encodeURIComponent(stationId)}` : ''}`,
    ),
  /** CSV-г auth header-тэй татаж, browser download өдөөнө */
  async downloadCsv(stationId: string, date: string, token: string | null): Promise<void> {
    const res = await fetch(
      `${API_BASE}/api/finance/daily.csv?stationId=${encodeURIComponent(stationId)}&date=${date}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) throw new Error('CSV татахад алдаа гарлаа');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-report-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ── Өдрийн хаалт (EOD) ──
export interface EodSummary {
  grossMnt: string;
  netMnt: string;
  vatMnt: string;
  collectedMnt: string;
  creditMnt: string;
  refundsMnt: string;
  salesCount: number;
  byMethod: Record<string, string>;
}
export interface DailyCloseRow {
  id: string;
  stationId: string;
  businessDate: string;
  salesGrossMnt: string;
  salesNetMnt: string;
  vatMnt: string;
  journalEntryId: string | null;
  station?: { code: string; name: string };
}
export interface EodStatusDto {
  stationId: string;
  date: string;
  closed: boolean;
  close: DailyCloseRow | null;
  summary: EodSummary;
}

export const eodApi = {
  status: (stationId: string, date: string) =>
    apiFetch<EodStatusDto>(`/finance/eod/status?stationId=${encodeURIComponent(stationId)}&date=${date}`),
  list: (stationId?: string) =>
    apiFetch<DailyCloseRow[]>(`/finance/eod${stationId ? `?stationId=${encodeURIComponent(stationId)}` : ''}`),
  close: (stationId: string, date: string) =>
    apiFetch<DailyCloseRow>('/finance/eod/close', { method: 'POST', body: JSON.stringify({ stationId, date }) }),
  reopen: (id: string) => apiFetch(`/finance/eod/${id}/reopen`, { method: 'POST' }),
};
