import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Түлшний идэвхтэй үнэ — салбар × грейд (түүхтэй, §6 FuelPrice).
 * Идэвхтэй үнэ = effectiveTo IS NULL, хамгийн сүүлийн effectiveFrom.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentFuelPriceMnt(
    stationId: string,
    fuelGradeId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<bigint> {
    const client = tx ?? this.prisma;
    const price = await client.fuelPrice.findFirst({
      where: { stationId, fuelGradeId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!price) {
      throw new NotFoundException({
        code: 'PRICE_NOT_FOUND',
        message: 'Тухайн грейдийн идэвхтэй үнэ олдсонгүй',
      });
    }
    return price.pricePerLiterMnt;
  }
}
