import { apiFetch } from './api';
import { invalidateCache } from './request-cache';

export interface AdminEmployee {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  employeeCode: string | null;
  roles: { stationId: string | null; role: { key: string; name: string } }[];
  stations: { stationId: string; station: { id: string; code: string; name: string } }[];
  user?: { username: string; isActive: boolean } | null;
}

export interface AdminRole {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissionKeys: string[];
}

export interface Permission {
  id: string;
  key: string;
  description?: string | null;
}

export interface FuelGradeDto {
  id: string;
  code: string;
  name: string;
}

export interface TankDto {
  id: string;
  stationId: string;
  code: string;
  fuelGradeId: string;
  capacityLiters: string;
  currentLiters: string;
  minLiters: string;
  isActive: boolean;
  fuelGrade: { id: string; code: string; name: string };
}

export const adminApi = {
  employees: () => apiFetch<AdminEmployee[]>('/admin/employees'),
  createEmployee: (body: unknown) =>
    apiFetch<AdminEmployee>('/admin/employees', { method: 'POST', body: JSON.stringify(body) }),
  updateEmployee: (id: string, body: unknown) =>
    apiFetch<AdminEmployee>(`/admin/employees/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setRoles: (id: string, roleKeys: string[]) =>
    apiFetch(`/admin/employees/${id}/roles`, { method: 'PUT', body: JSON.stringify({ roleKeys }) }),
  setStations: (id: string, stationIds: string[]) =>
    apiFetch(`/admin/employees/${id}/stations`, { method: 'PUT', body: JSON.stringify({ stationIds }) }),
  resetPassword: (id: string, password: string) =>
    apiFetch(`/admin/employees/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  deleteEmployee: (id: string) => apiFetch(`/admin/employees/${id}`, { method: 'DELETE' }),
  roles: () => apiFetch<AdminRole[]>('/admin/roles'),
  permissions: () => apiFetch<Permission[]>('/admin/permissions'),
  setRolePermissions: (key: string, permissionKeys: string[]) =>
    apiFetch(`/admin/roles/${key}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionKeys }),
    }),

  // Салбар (StationsModule) — өөрчилсний дараа `stations` кэшийг цэвэрлэнэ (posApi.stations кэштэй).
  createStation: async (body: unknown) => {
    const r = await apiFetch('/stations', { method: 'POST', body: JSON.stringify(body) });
    invalidateCache('stations');
    return r;
  },
  updateStation: async (id: string, body: unknown) => {
    const r = await apiFetch(`/stations/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    invalidateCache('stations');
    return r;
  },
  deleteStation: async (id: string) => {
    const r = await apiFetch(`/stations/${id}`, { method: 'DELETE' });
    invalidateCache('stations');
    return r;
  },

  // Резервуар (FuelTank) + грейд
  fuelGrades: () => apiFetch<FuelGradeDto[]>('/stations/fuel-grades'),
  tanks: (stationId: string) => apiFetch<TankDto[]>(`/stations/${stationId}/tanks`),
  createTank: (stationId: string, body: unknown) =>
    apiFetch<TankDto>(`/stations/${stationId}/tanks`, { method: 'POST', body: JSON.stringify(body) }),
  updateTank: (stationId: string, tankId: string, body: unknown) =>
    apiFetch<TankDto>(`/stations/${stationId}/tanks/${tankId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTank: (stationId: string, tankId: string) =>
    apiFetch(`/stations/${stationId}/tanks/${tankId}`, { method: 'DELETE' }),
};
