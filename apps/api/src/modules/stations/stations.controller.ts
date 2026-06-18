import { Body, Controller, Delete, Get, Ip, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateFuelTankInput,
  createFuelTankSchema,
  type CreateStationInput,
  createStationSchema,
  type UpdateFuelTankInput,
  updateFuelTankSchema,
  type UpdateStationInput,
  updateStationSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StationsService } from './stations.service';

@Controller('stations')
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.stations.list(user);
  }

  // ':id'-аас ӨМНӨ — эс бөгөөс 'fuel-grades' нь :id-д баригдана
  @Get('fuel-grades')
  fuelGrades() {
    return this.stations.listFuelGrades();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stations.get(user, id);
  }

  @Post()
  @Roles(RoleKey.OWNER, RoleKey.ADMIN)
  // Audit-ийг service дотор transaction-той хамт нарийн (before/after) бичдэг тул
  // interceptor-ийн @Audit-ийг давхардуулахгүй (§8).
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStationSchema)) dto: CreateStationInput,
    @Ip() ip: string,
  ) {
    return this.stations.create(user, dto, ip ?? null);
  }

  @Patch(':id')
  @Roles(RoleKey.OWNER, RoleKey.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStationSchema)) dto: UpdateStationInput,
    @Ip() ip: string,
  ) {
    return this.stations.update(user, id, dto, ip ?? null);
  }

  @Delete(':id')
  @Roles(RoleKey.OWNER, RoleKey.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.stations.softDelete(user, id, ip ?? null);
  }

  // ── Резервуар (FuelTank) — салбар доторх ──
  @Get(':id/tanks')
  tanks(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stations.listTanks(user, id);
  }

  @Post(':id/tanks')
  @Roles(RoleKey.OWNER, RoleKey.ADMIN, RoleKey.STATION_MANAGER)
  createTank(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createFuelTankSchema)) dto: CreateFuelTankInput,
    @Ip() ip: string,
  ) {
    return this.stations.createTank(user, id, dto, ip ?? null);
  }

  @Patch(':id/tanks/:tankId')
  @Roles(RoleKey.OWNER, RoleKey.ADMIN, RoleKey.STATION_MANAGER)
  updateTank(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('tankId') tankId: string,
    @Body(new ZodValidationPipe(updateFuelTankSchema)) dto: UpdateFuelTankInput,
    @Ip() ip: string,
  ) {
    return this.stations.updateTank(user, id, tankId, dto, ip ?? null);
  }

  @Delete(':id/tanks/:tankId')
  @Roles(RoleKey.OWNER, RoleKey.ADMIN, RoleKey.STATION_MANAGER)
  removeTank(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('tankId') tankId: string,
    @Ip() ip: string,
  ) {
    return this.stations.deleteTank(user, id, tankId, ip ?? null);
  }
}
