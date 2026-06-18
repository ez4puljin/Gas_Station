import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client wrapper. CLAUDE.md §2.2/§2.3 — query-г stationId-ээр scope хийж,
 * санхүүгийн үйлдлийг transaction дотор гүйцэтгэхэд энэ service-ийг ашиглана.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma холбогдлоо');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
