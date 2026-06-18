import { apiFetch } from './api';

export interface TankLite {
  id: string;
  code: string;
  fuelGrade: { id: string; code: string; name: string };
}

export interface ShiftTankReadingDto {
  id: string;
  phase: string;
  centimeters: string;
  liters: string | null;
  imageUrl: string | null;
  fuelTank: { id: string; code: string };
}
export interface ShiftTenderDto {
  method: string;
  declaredMnt: string;
  expectedMnt: string;
}
export interface ShiftFull {
  id: string;
  stationId: string;
  status: string;
  openingCashMnt: string;
  closingCashMnt: string | null;
  expectedCashMnt: string | null;
  openedAt: string;
  closeRequestedAt: string | null;
  cashiers: { employee: { id: string; firstName: string; lastName: string } }[];
  tankReadings: ShiftTankReadingDto[];
  tenders: ShiftTenderDto[];
  reconciliation?: { expectedCashMnt: string; countedCashMnt: string; varianceMnt: string } | null;
}

export interface OverviewStation {
  station: { id: string; code: string; name: string };
  shift: { id: string; status: string; openedAt: string; cashierName: string | null } | null;
  salesCount: number;
  todayGrossMnt: string;
  byMethod: Record<string, string>;
}
export interface PendingShift extends ShiftFull {
  stationLabel: string;
}
export interface Overview {
  stations: OverviewStation[];
  pending: PendingShift[];
}

export const controlApi = {
  overview: () => apiFetch<Overview>('/staff/overview'),
  current: (stationId: string) =>
    apiFetch<ShiftFull | null>(`/staff/shifts/current?stationId=${encodeURIComponent(stationId)}`),
  tanks: (stationId: string) => apiFetch<TankLite[]>(`/stations/${stationId}/tanks`),
  requestOpen: (body: unknown) =>
    apiFetch<ShiftFull>('/staff/shifts/request-open', { method: 'POST', body: JSON.stringify(body) }),
  requestClose: (id: string, body: unknown) =>
    apiFetch<ShiftFull>(`/staff/shifts/${id}/request-close`, { method: 'POST', body: JSON.stringify(body) }),
  approveOpen: (id: string) => apiFetch(`/staff/shifts/${id}/approve-open`, { method: 'POST' }),
  approveClose: (id: string) => apiFetch(`/staff/shifts/${id}/approve-close`, { method: 'POST' }),
  reject: (id: string, reason: string) =>
    apiFetch(`/staff/shifts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
};
