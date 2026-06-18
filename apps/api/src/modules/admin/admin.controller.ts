import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Put } from '@nestjs/common';
import {
  type CreateEmployeeInput,
  createEmployeeSchema,
  type CreateUserInput,
  createUserSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type SetEmployeeRolesInput,
  setEmployeeRolesSchema,
  type SetEmployeeStationsInput,
  setEmployeeStationsSchema,
  type SetRolePermissionsInput,
  setRolePermissionsSchema,
  type UpdateEmployeeInput,
  updateEmployeeSchema,
} from '@fuel/schemas';
import { type AuthUser, RoleKey } from '@fuel/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles(RoleKey.ADMIN) // OWNER/ADMIN (RolesGuard owner/admin bypass)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Ажилтан ──
  @Get('employees')
  listEmployees(@CurrentUser() user: AuthUser) {
    return this.admin.listEmployees(user);
  }

  @Post('employees')
  createEmployee(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEmployeeSchema)) dto: CreateEmployeeInput,
    @Ip() ip: string,
  ) {
    return this.admin.createEmployee(user, dto, ip ?? null);
  }

  @Patch('employees/:id')
  updateEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) dto: UpdateEmployeeInput,
    @Ip() ip: string,
  ) {
    return this.admin.updateEmployee(user, id, dto, ip ?? null);
  }

  @Delete('employees/:id')
  deleteEmployee(@CurrentUser() user: AuthUser, @Param('id') id: string, @Ip() ip: string) {
    return this.admin.softDeleteEmployee(user, id, ip ?? null);
  }

  @Put('employees/:id/roles')
  setRoles(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setEmployeeRolesSchema)) dto: SetEmployeeRolesInput,
    @Ip() ip: string,
  ) {
    return this.admin.setEmployeeRoles(user, id, dto, ip ?? null);
  }

  @Put('employees/:id/stations')
  setStations(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setEmployeeStationsSchema)) dto: SetEmployeeStationsInput,
    @Ip() ip: string,
  ) {
    return this.admin.setEmployeeStations(user, id, dto, ip ?? null);
  }

  @Post('employees/:id/user')
  createUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserInput,
    @Ip() ip: string,
  ) {
    return this.admin.createUserForEmployee(user, id, dto, ip ?? null);
  }

  @Post('employees/:id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput,
    @Ip() ip: string,
  ) {
    return this.admin.resetPassword(user, id, dto, ip ?? null);
  }

  // ── Role / Permission ──
  @Get('roles')
  listRoles() {
    return this.admin.listRoles();
  }

  @Get('permissions')
  listPermissions() {
    return this.admin.listPermissions();
  }

  @Put('roles/:key/permissions')
  setRolePermissions(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(setRolePermissionsSchema)) dto: SetRolePermissionsInput,
    @Ip() ip: string,
  ) {
    return this.admin.setRolePermissions(user, key, dto, ip ?? null);
  }
}
