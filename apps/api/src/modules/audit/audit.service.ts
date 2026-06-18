import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { redactDeep } from '../../common/utils/redact';
// BigInt.toJSON-ийг идэвхжүүлэх (Date/Decimal/BigInt-ийг аюулгүй JSON болгоно)
import '../../common/utils/bigint';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  stationId?: string | null;
  ip?: string | null;
  correlationId?: string | null;
}

/**
 * Аудитын бичлэг — CLAUDE.md §2.4, §8.
 * ЗӨВХӨН нэмнэ (append-only). UPDATE/DELETE хийхгүй.
 * Санхүүгийн үйлдлийн нарийн before/after-ийг transaction дотроос `record(input, tx)`-аар бичнэ.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Transaction дотор бичих (атомик байдлыг хадгална — §2.3). */
  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: toJson(input.before),
        after: toJson(input.after),
        stationId: input.stationId ?? null,
        ip: input.ip ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  /** Best-effort бичлэг — алдаа гарвал лог болгоод залгуулна (interceptor-д). */
  async recordSafe(input: AuditInput): Promise<void> {
    try {
      await this.record(input);
    } catch (err) {
      this.logger.error({ err, action: input.action, entity: input.entity }, 'Audit бичих алдаа');
    }
  }
}

/**
 * Эмзэг талбарыг redact хийгээд Prisma Json утга болгоно. null → JsonNull.
 * Эхлээд JSON-руу хөрвүүлж Date→ISO, Decimal→string, BigInt→string болгоод,
 * дараа нь түлхүүрээр redact хийнэ (Date зэрэг тусгай объектыг алдагдуулахгүй).
 */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  const plain: unknown = JSON.parse(JSON.stringify(value));
  return redactDeep(plain) as Prisma.InputJsonValue;
}
