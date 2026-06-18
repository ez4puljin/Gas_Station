import { Body, Controller, Get, Ip, Post, Query } from '@nestjs/common';
import {
  type SyncPullQuery,
  syncPullQuerySchema,
  type SyncPushInput,
  syncPushSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER)
  push(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(syncPushSchema)) dto: SyncPushInput,
    @Ip() ip: string,
  ) {
    return this.sync.push(user, dto, ip ?? null);
  }

  @Get('pull')
  @Roles(RoleKey.CASHIER, RoleKey.SHIFT_SUPERVISOR, RoleKey.STATION_MANAGER)
  pull(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(syncPullQuerySchema)) q: SyncPullQuery,
  ) {
    return this.sync.pull(user, q.stationId);
  }
}
