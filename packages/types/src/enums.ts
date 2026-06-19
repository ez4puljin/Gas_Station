/**
 * Домэйн enum-ууд — нэг эх сурвалж (single source of truth).
 * Эдгээрийн string утга нь Prisma schema-гийн enum-тэй ЯГ тохирно (drift гаргахгүй).
 *
 * `as const` + union pattern: TS enum-ээс илүү ergonomic, Zod-той сайн нийцнэ.
 */

/** Түлшний грейд — CLAUDE.md §12 (АИ-80, АИ-92, АИ-95, ДТ) */
export const FuelGradeCode = {
  AI_80: 'AI_80',
  AI_92: 'AI_92',
  AI_95: 'AI_95',
  DIESEL: 'DIESEL',
} as const;
export type FuelGradeCode = (typeof FuelGradeCode)[keyof typeof FuelGradeCode];

export const FUEL_GRADE_LABEL: Record<FuelGradeCode, string> = {
  AI_80: 'АИ-80',
  AI_92: 'АИ-92',
  AI_95: 'АИ-95',
  DIESEL: 'ДТ (дизель)',
};

/** Төлбөрийн төрөл — CLAUDE.md §6 Payment. CREDIT = харилцагчийн зээл (авлага үүснэ). */
export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  FUEL_CARD: 'FUEL_CARD',
  MOBILE: 'MOBILE',
  TRANSFER: 'TRANSFER',
  CREDIT: 'CREDIT',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Бэлэн',
  CARD: 'Пос (карт)',
  FUEL_CARD: 'Түлшний карт',
  MOBILE: 'Мобайл',
  TRANSFER: 'Шилжүүлэг',
  CREDIT: 'Зээл',
};

/** Харилцагчийн тооцооны гүйлгээний төрөл (авлага/өглөгийн дэвтэр) */
export const CustomerTxnType = {
  CREDIT_SALE: 'CREDIT_SALE', // зээлээр борлуулалт → авлага нэмэгдэнэ
  PAYMENT: 'PAYMENT', // төлбөр хүлээн авах → авлага хорогдоно
  ADJUSTMENT: 'ADJUSTMENT', // гар засвар (reason + actor)
} as const;
export type CustomerTxnType = (typeof CustomerTxnType)[keyof typeof CustomerTxnType];

export const CUSTOMER_TXN_LABEL: Record<CustomerTxnType, string> = {
  CREDIT_SALE: 'Зээлийн борлуулалт',
  PAYMENT: 'Төлбөр',
  ADJUSTMENT: 'Засвар',
};

/** Нийлүүлэгчийн тооцооны гүйлгээ (өглөг / AP дэвтэр) */
export const SupplierTxnType = {
  RECEIPT: 'RECEIPT', // бараа/түлш хүлээн авах → өглөг нэмэгдэнэ
  PAYMENT: 'PAYMENT', // нийлүүлэгчид төлөх → өглөг хорогдоно
  ADJUSTMENT: 'ADJUSTMENT', // гар засвар (reason + actor)
} as const;
export type SupplierTxnType = (typeof SupplierTxnType)[keyof typeof SupplierTxnType];

export const SUPPLIER_TXN_LABEL: Record<SupplierTxnType, string> = {
  RECEIPT: 'Хүлээн авалт',
  PAYMENT: 'Төлбөр',
  ADJUSTMENT: 'Засвар',
};

/** Худалдан авалтын (нийлүүлэлт) мөрийн төлөв */
export const PurchaseLineStatus = {
  PENDING: 'PENDING', // хүлээгдэж буй (бараа ирээгүй)
  RECEIVED: 'RECEIVED', // хүлээн авсан (нөөц/саванд орсон)
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseLineStatus = (typeof PurchaseLineStatus)[keyof typeof PurchaseLineStatus];

export const PURCHASE_LINE_STATUS_LABEL: Record<PurchaseLineStatus, string> = {
  PENDING: 'Хүлээгдэж буй',
  RECEIVED: 'Хүлээн авсан',
  CANCELLED: 'Цуцалсан',
};

/** Нөөцийн хөдөлгөөний төрөл — CLAUDE.md §6 StockMovement */
export const StockMovementType = {
  RECEIPT: 'RECEIPT', // нийлүүлэлт хүлээн авах
  SALE: 'SALE', // борлуулалт
  ADJUSTMENT: 'ADJUSTMENT', // тооллогын засвар
  TRANSFER: 'TRANSFER', // салбар хооронд шилжүүлэг
  LOSS: 'LOSS', // хорогдол/алдагдал
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

/** Борлуулалтын мөрийн төрөл */
export const SaleItemType = {
  FUEL: 'FUEL',
  PRODUCT: 'PRODUCT',
} as const;
export type SaleItemType = (typeof SaleItemType)[keyof typeof SaleItemType];

/** Борлуулалтын төлөв */
export const SaleStatus = {
  COMPLETED: 'COMPLETED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  COMPLETED: 'Дууссан',
  VOIDED: 'Цуцлагдсан',
  REFUNDED: 'Буцаагдсан',
};

/** Түлш олгох горим — CLAUDE.md §7.1 (prepay/postpay) */
export const FuelSaleMode = {
  PREPAY: 'PREPAY',
  POSTPAY: 'POSTPAY',
} as const;
export type FuelSaleMode = (typeof FuelSaleMode)[keyof typeof FuelSaleMode];

/** Ээлжийн төлөв — CLAUDE.md §6, §7.3 (хүсэлт → батлах урсгал) */
export const ShiftStatus = {
  PENDING_OPEN: 'PENDING_OPEN',
  OPEN: 'OPEN',
  PENDING_CLOSE: 'PENDING_CLOSE',
  CLOSED: 'CLOSED',
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  PENDING_OPEN: 'Нээлт хүлээгдэж буй',
  OPEN: 'Идэвхтэй',
  PENDING_CLOSE: 'Хаалт хүлээгдэж буй',
  CLOSED: 'Хаагдсан',
};

/** Ажилтны статус */
export const EmployeeStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

/** RBAC role-ууд — CLAUDE.md §6 (cashier ... owner) */
export const RoleKey = {
  CASHIER: 'CASHIER',
  SHIFT_SUPERVISOR: 'SHIFT_SUPERVISOR',
  STATION_MANAGER: 'STATION_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
} as const;
export type RoleKey = (typeof RoleKey)[keyof typeof RoleKey];

export const ROLE_LABEL: Record<RoleKey, string> = {
  CASHIER: 'Кассчин',
  SHIFT_SUPERVISOR: 'Ээлжийн ахлагч',
  STATION_MANAGER: 'Салбарын менежер',
  ACCOUNTANT: 'Нягтлан',
  ADMIN: 'Админ',
  OWNER: 'Эзэмшигч',
};

/** Түлшний нийлүүлэлтийн төлөв */
export const FuelDeliveryStatus = {
  PENDING: 'PENDING',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type FuelDeliveryStatus = (typeof FuelDeliveryStatus)[keyof typeof FuelDeliveryStatus];

/** Offline sync-ийн төлөв — CLAUDE.md §9 */
export const SyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
  CONFLICT: 'CONFLICT',
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

/** Аудит үйлдлийн төрөл — CLAUDE.md §8 (append-only) */
export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  SOFT_DELETE: 'SOFT_DELETE',
  SALE: 'SALE',
  VOID: 'VOID',
  REFUND: 'REFUND',
  PRICE_CHANGE: 'PRICE_CHANGE',
  STOCK_ADJUST: 'STOCK_ADJUST',
  STOCK_TRANSFER: 'STOCK_TRANSFER',
  TANK_READING: 'TANK_READING',
  FUEL_DELIVERY: 'FUEL_DELIVERY',
  SHIFT_OPEN: 'SHIFT_OPEN',
  SHIFT_CLOSE: 'SHIFT_CLOSE',
  CASH_RECONCILE: 'CASH_RECONCILE',
  EMPLOYEE_CHANGE: 'EMPLOYEE_CHANGE',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
  CUSTOMER_ADJUST: 'CUSTOMER_ADJUST',
  PURCHASE_CREATE: 'PURCHASE_CREATE',
  PURCHASE_RECEIVE: 'PURCHASE_RECEIVE',
  PURCHASE_CANCEL: 'PURCHASE_CANCEL',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',
  SUPPLIER_ADJUST: 'SUPPLIER_ADJUST',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** И-баримтын төрөл — CLAUDE.md §12 (иргэн/байгууллага) */
export const ReceiptCustomerType = {
  INDIVIDUAL: 'INDIVIDUAL',
  ORGANIZATION: 'ORGANIZATION',
} as const;
export type ReceiptCustomerType = (typeof ReceiptCustomerType)[keyof typeof ReceiptCustomerType];
