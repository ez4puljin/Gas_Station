import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@fuel/types';

/**
 * Хэрэглэгч тухайн салбарт хандах эрхтэй эсэхийг шалгана (§2.2/§10).
 *   1) Салбар нь хэрэглэгчийн КОМПАНИД харьяалагдах ёстой
 *      (allStations = "ӨӨРИЙН компанийн бүх салбар", өөр tenant-д ХАНДАХГҮЙ).
 *   2) allStations биш бол stationIds дотор байх ёстой.
 *
 * Company-г шалгахын тулд DB lookup хийдэг тул async. tx эсвэл PrismaService дамжуулна.
 */
export async function assertStationAccess(
  db: Pick<Prisma.TransactionClient, 'station'>,
  user: AuthUser,
  stationId: string,
): Promise<void> {
  const denied = () =>
    new ForbiddenException({
      code: 'FORBIDDEN_STATION',
      message: 'Энэ салбарт хандах эрхгүй байна',
    });

  if (!user.allStations && !user.stationIds.includes(stationId)) {
    throw denied();
  }

  const station = await db.station.findFirst({
    where: { id: stationId, companyId: user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!station) throw denied();
}
