import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Redis } from 'ioredis';
import type { AuthTokens } from '@fuel/schemas';
import type { AuthUser, RefreshTokenPayload } from '@fuel/types';
import { REDIS } from '../../common/redis/redis.module';
import { durationToSeconds } from '../../common/utils/duration';

/**
 * Token амьдралын мөчлөг — CLAUDE.md §11.
 *   • access (богино) + refresh (урт).
 *   • refresh-ийн jti-г Redis-д хадгална → logout = jti цуцлах.
 *   • refresh ашиглах бүрт rotation (хуучин jti устах).
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.accessTtl = durationToSeconds(this.config.getOrThrow<string>('JWT_ACCESS_TTL'));
    this.refreshTtl = durationToSeconds(this.config.getOrThrow<string>('JWT_REFRESH_TTL'));
  }

  private refreshKey(sub: string, jti: string): string {
    return `refresh:${sub}:${jti}`;
  }

  async issueTokens(user: AuthUser): Promise<AuthTokens> {
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.sub,
        employeeId: user.employeeId,
        companyId: user.companyId,
        roles: user.roles,
        stationIds: user.stationIds,
        allStations: user.allStations,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTtl,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.sub, jti } satisfies RefreshTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTtl,
      },
    );

    await this.redis.set(this.refreshKey(user.sub, jti), '1', 'EX', this.refreshTtl);

    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  /** refresh token-ийг шалгаж, rotation хийнэ. Хүчингүй бол null. */
  async verifyAndConsumeRefresh(token: string): Promise<RefreshTokenPayload | null> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return null;
    }
    const key = this.refreshKey(payload.sub, payload.jti);
    const existed = await this.redis.del(key);
    if (existed === 0) return null; // аль хэдийн ашиглагдсан/цуцлагдсан
    return payload;
  }

  async revoke(sub: string, jti: string): Promise<void> {
    await this.redis.del(this.refreshKey(sub, jti));
  }

  /**
   * Хэрэглэгчийн бүх session-ийг цуцлах.
   * KEYS биш SCAN — Redis-ийн event loop-ийг блоклохгүй (§3 өндөр гүйцэтгэл).
   */
  async revokeAll(sub: string): Promise<void> {
    const pattern = `refresh:${sub}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await this.redis.del(...keys);
    } while (cursor !== '0');
  }
}
