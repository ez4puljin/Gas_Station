import { SetMetadata } from '@nestjs/common';
import type { RoleKey } from '@fuel/types';

export const ROLES_KEY = 'roles';

/** Route-д шаардлагатай role-ууд — RBAC (CLAUDE.md §11). */
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);
