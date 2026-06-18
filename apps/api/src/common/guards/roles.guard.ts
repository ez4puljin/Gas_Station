import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthUser, RoleKey } from '@fuel/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** RBAC — route-д заасан role-ийн аль нэгийг шаардана. owner/admin бүгдийг дамжина. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RoleKey[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Эрх шаардлагатай' });
    }

    if (user.roles.includes(RoleKey.OWNER) || user.roles.includes(RoleKey.ADMIN)) {
      return true;
    }

    const allowed = required.some((role) => user.roles.includes(role));
    if (!allowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Энэ үйлдлийг гүйцэтгэх эрх хүрэлцэхгүй байна',
      });
    }
    return true;
  }
}
