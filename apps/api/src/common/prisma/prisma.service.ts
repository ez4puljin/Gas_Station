import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * ГҮЙЦЭТГЭЛ: PostgreSQL нь prepared statement-ийг 5 удаа гүйцэтгэсний дараа "generic
 * plan" руу шилждэг. Prisma бүх query-г prepared statement болгодог тул огнооны
 * ӨӨР ӨӨР муж (7 хоног / 90 хоног) нэг л statement-ээр дамжихад planner нь аль ч
 * мужид тохирохгүй нэг төлөвлөгөө сонгоод ТҮГЖИГДЭНЭ — сервер удаан ажиллах тусам
 * тайлан аажим удаашрах шалтгаан нь энэ (хэмжилт: 99k борлуулалт дээр 158ms → 935ms,
 * сервер дахин асаахад л сэргэдэг). `force_custom_plan` нь параметр бүрд дахин
 * төлөвлүүлж, огнооны мужид тохирсон төлөвлөгөө сонгуулна.
 *
 * URL-д аль хэдийн `options=` байвал хүндэтгэнэ (deploy орчны тохиргоог дарахгүй).
 */
function withPlannerOptions(url: string | undefined): string | undefined {
  if (!url || url.includes('options=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}options=-c%20plan_cache_mode%3Dforce_custom_plan`;
}

/**
 * Prisma client wrapper. CLAUDE.md §2.2/§2.3 — query-г stationId-ээр scope хийж,
 * санхүүгийн үйлдлийг transaction дотор гүйцэтгэхэд энэ service-ийг ашиглана.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = withPlannerOptions(process.env.DATABASE_URL);
    super({
      ...(url ? { datasources: { db: { url } } } : {}),
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
