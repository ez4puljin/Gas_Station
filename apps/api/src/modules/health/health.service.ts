import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS } from '../../common/redis/redis.module';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(): Promise<{
    status: 'ok' | 'degraded';
    db: boolean;
    redis: boolean;
    at: string;
  }> {
    const [db, redisOk] = await Promise.all([this.pingDb(), this.pingRedis()]);
    return {
      status: db && redisOk ? 'ok' : 'degraded',
      db,
      redis: redisOk,
      at: new Date().toISOString(),
    };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
