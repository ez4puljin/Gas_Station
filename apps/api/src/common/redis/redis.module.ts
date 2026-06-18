import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/** DI token — `@Inject(REDIS)` -ээр Redis client авна. */
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('Redis');
        const url = config.getOrThrow<string>('REDIS_URL');
        const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
        // Холболтын алдааг чимээгүй залгих биш, бүтэцтэй логлоно (unhandled error-оос сэргийлнэ)
        client.on('error', (err: Error) => logger.warn(`Redis алдаа: ${err.message}`));
        client.on('connect', () => logger.log('Redis холбогдлоо'));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
