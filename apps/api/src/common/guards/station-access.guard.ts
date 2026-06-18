import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '@fuel/types';

/**
 * Салбарын хандалт хяналт — CLAUDE.md §10.
 * Хүсэлтэд stationId (params/query/body) байвал хэрэглэгчид тухайн салбарт хандах
 * эрх байгаа эсэхийг шалгана. owner/admin (allStations) бүх салбарт хандана.
 *
 * Сервис давхаргын default stationId scoping-ийн НЭМЭЛТ хамгаалалт.
 */
@Injectable()
export class StationAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    }>();

    const stationId =
      req.params?.stationId ??
      (typeof req.query?.stationId === 'string' ? req.query.stationId : undefined) ??
      (typeof req.body?.stationId === 'string' ? (req.body.stationId as string) : undefined);

    if (!stationId) return true; // салбар заагаагүй route — сервис өөрөө scope хийнэ

    const user = req.user;
    if (!user) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Эрх шаардлагатай' });
    if (user.allStations) return true;
    if (!user.stationIds.includes(stationId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_STATION',
        message: 'Энэ салбарт хандах эрхгүй байна',
      });
    }
    return true;
  }
}
