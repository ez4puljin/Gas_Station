import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import { THROTTLE_KEY, type ThrottleOptions } from '../decorators/throttle.decorator';
import { REDIS } from '../redis/redis.module';

/**
 * Redis INCR+EXPIRE дээр суурилсан энгийн rate limiter — CLAUDE.md §11.
 * `@Throttle({limit, ttlSeconds})`-тэй route-уудад л үйлчилнэ.
 * Redis унтарсан үед fail-open (нэвтрэлтийг дэд бүтцийн алдаанаас болж хаахгүй).
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger('Throttle');

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    const scope = `${context.getClass().name}.${context.getHandler().name}`;
    const key = `throttle:${scope}:${ip}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, opts.ttlSeconds);
      }
      if (count > opts.limit) {
        throw new HttpException(
          { code: 'TOO_MANY_REQUESTS', message: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Throttle Redis алдаа (fail-open): ${(err as Error).message}`);
      return true;
    }
  }
}
