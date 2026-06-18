import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import type { AuthUser } from '@fuel/types';
import { AUDIT_KEY, type AuditMeta } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * `@Audit({action, entity})`-аар тэмдэглэгдсэн route-уудад автоматаар coarse audit бичнэ
 * (CLAUDE.md §8). Нарийн before/after-ийг service-үүд transaction дотроос бичнэ.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<
      Request & { id?: string; user?: AuthUser }
    >();
    const user = req.user;
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? req.id ?? null;
    const ip = req.ip ?? null;

    return next.handle().pipe(
      tap((result) => {
        void this.audit.recordSafe({
          actorId: user?.sub ?? null,
          action: meta.action,
          entity: meta.entity,
          entityId: extractId(result),
          after: result,
          stationId: extractStationId(req, result),
          ip,
          correlationId,
        });
      }),
    );
  }
}

function extractId(result: unknown): string | null {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function extractStationId(
  req: Request & { user?: AuthUser },
  result: unknown,
): string | null {
  if (result && typeof result === 'object' && 'stationId' in result) {
    const sid = (result as { stationId: unknown }).stationId;
    if (typeof sid === 'string') return sid;
  }
  const params = req.params as Record<string, string> | undefined;
  if (params?.stationId) return params.stationId;
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body.stationId === 'string') return body.stationId;
  return null;
}
