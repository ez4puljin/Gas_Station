import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  /** Компанийн ажилтны жагсаалт (company scope — §10). */
  listEmployees(user: AuthUser) {
    return this.prisma.employee.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        roles: { include: { role: true } },
        stations: true,
      },
    });
  }
}
