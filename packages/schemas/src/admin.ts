import { z } from 'zod';
import { RoleKey } from '@fuel/types';
import { passwordSchema } from './auth';

const roleKeySchema = z.nativeEnum(RoleKey);

/** Ажилтан бүртгэх — овог/нэр/утас/хаяг/салбар/эрх/нэвтрэх данс заавал. */
export const createEmployeeSchema = z.object({
  firstName: z.string().min(1, 'Нэр шаардлагатай'),
  lastName: z.string().min(1, 'Овог шаардлагатай'),
  employeeCode: z.string().optional(),
  phone: z.string().min(1, 'Утасны дугаар шаардлагатай'),
  address: z.string().min(1, 'Хаяг шаардлагатай'),
  email: z.string().optional(),
  stationIds: z.array(z.string()).min(1, 'Салбар сонгоно уу'),
  roleKeys: z.array(roleKeySchema).min(1, 'Эрх сонгоно уу'),
  // Нэвтрэх данс заавал — ажилтан системд нэвтэрнэ
  username: z.string().min(1, 'Нэвтрэх нэр шаардлагатай'),
  password: passwordSchema,
  isActive: z.boolean().default(true),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  employeeCode: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** Ажилтны role-уудыг бүхэлд нь тохируулах (replace). */
export const setEmployeeRolesSchema = z.object({ roleKeys: z.array(roleKeySchema) });
export type SetEmployeeRolesInput = z.infer<typeof setEmployeeRolesSchema>;

/** Ажилтны хандах салбаруудыг тохируулах (replace). */
export const setEmployeeStationsSchema = z.object({ stationIds: z.array(z.string()) });
export type SetEmployeeStationsInput = z.infer<typeof setEmployeeStationsSchema>;

/** Одоо байгаа ажилтанд нэвтрэх данс үүсгэх / нууц үг сэргээх. */
export const createUserSchema = z.object({
  username: z.string().min(1),
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const resetPasswordSchema = z.object({ password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Role-ийн permission-уудыг тохируулах (admin). */
export const setRolePermissionsSchema = z.object({ permissionKeys: z.array(z.string()) });
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;
