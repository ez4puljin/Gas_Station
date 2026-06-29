import { apiFetch } from './api';

export interface AttEmployee {
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
export interface AttRecord {
  id: string;
  employeeId: string;
  stationId: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  note: string | null;
  employee: AttEmployee;
  station?: StationLite;
}
export interface AttList {
  from: string;
  to: string;
  rows: AttRecord[];
}
export interface AttSummaryRow {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  shifts: number;
  workedMinutes: number;
}
export interface AttSummary {
  from: string;
  to: string;
  totalMinutes: number;
  rows: AttSummaryRow[];
}

function qs(o: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const attendanceApi = {
  employees: () => apiFetch<AttEmployee[]>('/attendance/employees'),
  current: (stationId?: string) => apiFetch<AttRecord[]>(`/attendance/current${qs({ stationId })}`),
  list: (q: { from: string; to: string; stationId?: string; employeeId?: string }) =>
    apiFetch<AttList>(`/attendance${qs(q)}`),
  summary: (q: { from: string; to: string; stationId?: string }) =>
    apiFetch<AttSummary>(`/attendance/summary${qs(q)}`),
  clockIn: (body: { employeeId: string; stationId: string; note?: string }) =>
    apiFetch<AttRecord>('/attendance/clock-in', { method: 'POST', body: JSON.stringify(body) }),
  clockOut: (id: string, body: { breakMinutes?: number; note?: string }) =>
    apiFetch<AttRecord>(`/attendance/${id}/clock-out`, { method: 'POST', body: JSON.stringify(body) }),
  manual: (body: { employeeId: string; stationId: string; clockIn: string; clockOut: string; breakMinutes?: number; note?: string }) =>
    apiFetch<AttRecord>('/attendance/manual', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id: string, reason: string) =>
    apiFetch(`/attendance/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
};
