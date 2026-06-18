import { apiFetch } from './api';

export interface StockProduct {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: string;
  reorderLevel: string;
}
export interface StockTank {
  tankId: string;
  code: string;
  grade: string;
  capacityLiters: string;
  currentLiters: string;
  minLiters: string;
}
export interface StockOverview {
  products: StockProduct[];
  tanks: StockTank[];
}
export interface AlertsDto {
  products: { productId: string; name: string; quantity: string; reorderLevel: string }[];
  tanks: { tankId: string; code: string; grade: string; currentLiters: string; minLiters: string }[];
}
export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  groupId: string | null;
  supplierId: string | null;
  category: string | null;
  unit: string;
  barcode: string | null;
  imageUrl: string | null;
  priceMnt: string;
  costMnt: string | null;
  isVatable: boolean;
  isActive: boolean;
  group: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
}
export interface ProductGroupDto {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}
export interface SupplierDto {
  id: string;
  name: string;
  phone: string | null;
  contact: string | null;
  isActive: boolean;
}

export const inventoryApi = {
  stock: (stationId: string) =>
    apiFetch<StockOverview>(`/inventory/stock?stationId=${encodeURIComponent(stationId)}`),
  alerts: (stationId: string) =>
    apiFetch<AlertsDto>(`/inventory/alerts?stationId=${encodeURIComponent(stationId)}`),
  adjust: (body: unknown) =>
    apiFetch('/inventory/adjustments', { method: 'POST', body: JSON.stringify(body) }),
  receiveDelivery: (body: unknown) =>
    apiFetch('/inventory/deliveries', { method: 'POST', body: JSON.stringify(body) }),

  // Бараа CRUD
  products: () => apiFetch<ProductDto[]>('/inventory/products'),
  createProduct: (body: unknown) =>
    apiFetch<ProductDto>('/inventory/products', { method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (id: string, body: unknown) =>
    apiFetch<ProductDto>(`/inventory/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProduct: (id: string) => apiFetch(`/inventory/products/${id}`, { method: 'DELETE' }),

  // Барааны бүлэг
  groups: () => apiFetch<ProductGroupDto[]>('/inventory/product-groups'),
  createGroup: (body: unknown) =>
    apiFetch<ProductGroupDto>('/inventory/product-groups', { method: 'POST', body: JSON.stringify(body) }),
  updateGroup: (id: string, body: unknown) =>
    apiFetch<ProductGroupDto>(`/inventory/product-groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGroup: (id: string) => apiFetch(`/inventory/product-groups/${id}`, { method: 'DELETE' }),

  // Нийлүүлэгч
  suppliers: () => apiFetch<SupplierDto[]>('/inventory/suppliers'),
  createSupplier: (body: unknown) =>
    apiFetch<SupplierDto>('/inventory/suppliers', { method: 'POST', body: JSON.stringify(body) }),
};
