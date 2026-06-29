import { apiFetch } from './api';
import type { LeaveStatus, LeaveType } from '@fuel/schemas';

export interface LeaveEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  annualLeaveDays: number;
}
interface EmpLite {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
}
export interface LeaveRow {
  id: string;
  employeeId: string;
  type: LeaveType;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  employee: EmpLite;
}
export interface LeaveBalanceRow {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  entitlement: number;
  used: number;
  remaining: number;
}

function qs(o: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const leaveApi = {
  employees: () => apiFetch<LeaveEmployee[]>('/leave/employees'),
  list: (q: { status?: string; employeeId?: string; from?: string; to?: string }) =>
    apiFetch<{ rows: LeaveRow[] }>(`/leave${qs(q)}`),
  balances: (year?: number) =>
    apiFetch<{ year: number; rows: LeaveBalanceRow[] }>(`/leave/balances${qs({ year: year ? String(year) : undefined })}`),
  onLeave: (date?: string) => apiFetch<{ date: string; rows: LeaveRow[] }>(`/leave/on-leave${qs({ date })}`),
  request: (body: { employeeId: string; type: LeaveType; startDate: string; endDate: string; reason?: string }) =>
    apiFetch<LeaveRow>('/leave/request', { method: 'POST', body: JSON.stringify(body) }),
  approve: (id: string) => apiFetch<LeaveRow>(`/leave/${id}/approve`, { method: 'POST' }),
  reject: (id: string, note?: string) =>
    apiFetch<LeaveRow>(`/leave/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  cancel: (id: string) => apiFetch<LeaveRow>(`/leave/${id}/cancel`, { method: 'POST' }),
};
