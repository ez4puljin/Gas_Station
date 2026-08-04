import { apiFetch } from './api';
import type { CashCaseResolution, CashCaseStatus } from '@fuel/schemas';

interface EmpLite {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
}
interface StationLite {
  id: string;
  code: string;
  name: string;
}

export interface CashCaseRow {
  id: string;
  stationId: string;
  shiftId: string;
  employeeId: string;
  varianceMnt: string;
  amountMnt: string;
  recoveredMnt: string;
  status: CashCaseStatus;
  resolution: CashCaseResolution | null;
  note: string | null;
  decidedAt: string | null;
  createdAt: string;
  employee: EmpLite;
  station: StationLite;
}
export interface CashCaseList {
  rows: CashCaseRow[];
  openCount: number;
  outstandingMnt: string;
}
export interface ScorecardRow {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  cases: number;
  shortageCount: number;
  overageCount: number;
  shortageMnt: string;
  overageMnt: string;
  outstandingMnt: string;
  netVarianceMnt: string;
}
export interface Scorecard {
  from: string;
  to: string;
  totals: { cases: number; shortageMnt: string; overageMnt: string; outstandingMnt: string };
  rows: ScorecardRow[];
}

function qs(o: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const cashCasesApi = {
  list: (q: { status?: string; stationId?: string; employeeId?: string; from?: string; to?: string }) =>
    apiFetch<CashCaseList>(`/cash-cases${qs(q)}`),
  scorecard: (q: { from: string; to: string; stationId?: string }) =>
    apiFetch<Scorecard>(`/cash-cases/scorecard${qs(q)}`),
  resolve: (id: string, resolution: CashCaseResolution, note?: string) =>
    apiFetch<CashCaseRow>(`/cash-cases/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution, note }) }),
};
