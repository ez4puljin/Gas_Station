import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  /** AuditAction (ж: "SALE", "PRICE_CHANGE") */
  action: string;
  /** Бичлэгийн entity нэр (ж: "Sale") */
  entity: string;
}

/**
 * Route дээр audit бичих заавар — AuditInterceptor уншина (CLAUDE.md §8).
 * Нарийн before/after шаардлагатай үед service дотроос AuditService.record-ийг
 * transaction дотор шууд дуудна.
 */
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
