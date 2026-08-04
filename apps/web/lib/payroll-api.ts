import { apiFetch } from './api';

export interface PayrollEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  status: string;
  baseSalaryMnt: string;
}

export interface PayrollTotals {
  grossMnt: string;
  employeeNdshMnt: string;
  pitMnt: string;
  employerNdshMnt: string;
  /** Кассын дутагдлын суутгал (гарт олгохоос хасагдсан). */
  deductionMnt: string;
  netMnt: string;
}
export interface PayrollLine {
  employeeId: string;
  name: string;
  baseSalaryMnt: string;
  bonusMnt: string;
  grossMnt: string;
  employeeNdshMnt: string;
  pitMnt: string;
  employerNdshMnt: string;
  deductionMnt: string;
  netMnt: string;
}
export interface PayrollPreview {
  period: string;
  posted: boolean;
  items: PayrollLine[];
  totals: PayrollTotals;
}
export interface PayrollRun extends PayrollTotals {
  id: string;
  period: string;
  status: string;
  journalEntryId: string | null;
  createdAt: string;
  itemCount?: number;
}
export interface PayrollItemRow extends PayrollTotals {
  id: string;
  baseSalaryMnt: string;
  bonusMnt: string;
  employee: { firstName: string; lastName: string; employeeCode: string | null };
}
export interface PayrollRunDetail extends PayrollRun {
  items: PayrollItemRow[];
}

export const payrollApi = {
  employees: () => apiFetch<PayrollEmployee[]>('/payroll/employees'),
  setSalary: (id: string, baseSalaryMnt: string) =>
    apiFetch(`/payroll/employees/${id}/salary`, { method: 'PATCH', body: JSON.stringify({ baseSalaryMnt }) }),
  preview: (period: string) => apiFetch<PayrollPreview>(`/payroll/preview?period=${period}`),
  list: () => apiFetch<PayrollRun[]>('/payroll'),
  get: (id: string) => apiFetch<PayrollRunDetail>(`/payroll/${id}`),
  run: (period: string, bonuses?: { employeeId: string; amountMnt: string }[]) =>
    apiFetch<PayrollRun>('/payroll/run', { method: 'POST', body: JSON.stringify({ period, bonuses }) }),
  reverse: (id: string) => apiFetch(`/payroll/${id}/reverse`, { method: 'POST' }),
};
