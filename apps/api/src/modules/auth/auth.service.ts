import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { type AuthTokens, type LoginInput } from '@fuel/schemas';
import { AuditAction, type AuthUser, EmployeeStatus, type RoleKey } from '@fuel/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from './token.service';

const userInclude = {
  employee: {
    include: {
      roles: { include: { role: true } },
      stations: true,
    },
  },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /** POS/толгойд харуулах: кассирын нэр + хандах эрхтэй салбарууд. */
  async profile(user: AuthUser) {
    const [employee, stations] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: user.employeeId, companyId: user.companyId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.station.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          ...(user.allStations ? {} : { id: { in: user.stationIds } }),
        },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    const name = employee ? `${employee.firstName} ${employee.lastName}`.trim() : null;
    return { ...user, name, stations };
  }

  async login(
    input: LoginInput,
    ip: string | null,
  ): Promise<AuthTokens & { user: AuthUser }> {
    const invalid = () =>
      new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Нэвтрэх нэр эсвэл нууц үг буруу байна',
      });

    const user = await this.prisma.user.findFirst({
      where: { username: input.username, deletedAt: null, isActive: true },
      include: userInclude,
    });

    if (!user || user.employee.deletedAt || user.employee.status !== EmployeeStatus.ACTIVE) {
      throw invalid();
    }

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) throw invalid();

    const authUser = this.buildAuthUser(user);

    if (
      input.stationId &&
      !authUser.allStations &&
      !authUser.stationIds.includes(input.stationId)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_STATION',
        message: 'Энэ салбарт хандах эрхгүй байна',
      });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokens.issueTokens(authUser);

    await this.audit.recordSafe({
      actorId: authUser.sub,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      ip,
      stationId: input.stationId ?? null,
    });

    return { ...tokens, user: authUser };
  }

  async refresh(token: string): Promise<AuthTokens> {
    const payload = await this.tokens.verifyAndConsumeRefresh(token);
    if (!payload) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_REFRESH',
        message: 'Сесс хүчингүй боллоо. Дахин нэвтэрнэ үү',
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      include: userInclude,
    });

    if (!user || user.employee.deletedAt || user.employee.status !== EmployeeStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_REFRESH',
        message: 'Сесс хүчингүй боллоо. Дахин нэвтэрнэ үү',
      });
    }

    return this.tokens.issueTokens(this.buildAuthUser(user));
  }

  async logout(user: AuthUser, refreshToken: string, ip: string | null): Promise<void> {
    await this.tokens.verifyAndConsumeRefresh(refreshToken);
    await this.audit.recordSafe({
      actorId: user.sub,
      action: AuditAction.LOGOUT,
      entity: 'User',
      entityId: user.sub,
      ip,
    });
  }

  private buildAuthUser(user: {
    id: string;
    employeeId: string;
    employee: {
      companyId: string;
      roles: Array<{ role: { key: string } }>;
      stations: Array<{ stationId: string }>;
    };
  }): AuthUser {
    const roles = [...new Set(user.employee.roles.map((r) => r.role.key))] as RoleKey[];
    const stationIds = user.employee.stations.map((s) => s.stationId);
    const allStations = roles.includes('OWNER') || roles.includes('ADMIN');
    return {
      sub: user.id,
      employeeId: user.employeeId,
      companyId: user.employee.companyId,
      roles,
      stationIds,
      allStations,
    };
  }
}
