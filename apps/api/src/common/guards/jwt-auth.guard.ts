import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '@fuel/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Бүх route-д JWT шаардана; `@Public()` тэмдэглэгдсэнийг алгасна (CLAUDE.md §11). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  // Алдааны мессежийг Монголоор (§14)
  override handleRequest<TUser = AuthUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Нэвтрэх шаардлагатай',
      });
    }
    return user;
  }
}
