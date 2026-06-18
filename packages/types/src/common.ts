import type { RoleKey } from './enums';

/** Бүх entity-д нийтлэг талбар — CLAUDE.md §6 */
export interface BaseEntity {
  id: string;
  createdAt: string; // ISO-8601 UTC
  updatedAt: string; // ISO-8601 UTC
  deletedAt?: string | null; // soft-delete — CLAUDE.md §2.6
}

/** Хуудаслалтын хүсэлт */
export interface PaginationParams {
  page: number; // 1-ээс эхэлнэ
  pageSize: number;
}

/** Хуудаслагдсан хариу */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Алдааны нэгдсэн бүтэц — global filter-ээр буцна (CLAUDE.md §14) */
export interface ApiError {
  statusCode: number;
  /** Машинд ойлгомжтой код, ж: `AUTH_INVALID_CREDENTIALS` */
  code: string;
  /** Хэрэглэгчид зориулсан Монгол мессеж */
  message: string;
  /** Хүсэлт мөшгих correlationId (лог-той тааруулна) */
  correlationId?: string;
  /** Талбар бүрийн validation алдаа (Zod) */
  details?: Record<string, string[]>;
}

/**
 * JWT access token-ы payload + req.user.
 * Эмзэг өгөгдөл (нууц үг, токен) ЭНД БАЙХГҮЙ — CLAUDE.md §2.5, §11.
 */
export interface AuthUser {
  /** User.id */
  sub: string;
  employeeId: string;
  /** Хэрэглэгчийн role-ууд (RBAC) */
  roles: RoleKey[];
  /** Хандах эрхтэй салбарууд — CLAUDE.md §10 */
  stationIds: string[];
  /** owner/admin бол бүх салбар */
  allStations: boolean;
  companyId: string;
}

/** Refresh token rotation-д ашиглах payload */
export interface RefreshTokenPayload {
  sub: string;
  /** Redis-д хадгалагдсан session/jti */
  jti: string;
}

/** Аудитын бичлэгийн shape — CLAUDE.md §8 (append-only) */
export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown | null;
  after: unknown | null;
  stationId: string | null;
  ip: string | null;
  at: string; // ISO-8601 UTC
  correlationId?: string | null;
}
