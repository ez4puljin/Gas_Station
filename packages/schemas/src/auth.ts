import { z } from 'zod';

/** Нэвтрэх — CLAUDE.md §11 */
export const loginSchema = z.object({
  username: z.string().min(1, 'Нэвтрэх нэр шаардлагатай'),
  password: z.string().min(1, 'Нууц үг шаардлагатай'),
  /** Олон салбарт хандах эрхтэй хэрэглэгч идэвхтэй салбараа сонгож болно */
  stationId: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken шаардлагатай'),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Нууц үгийн бодлого — argon2-аар hash хийнэ (CLAUDE.md §11) */
export const passwordSchema = z
  .string()
  .min(8, 'Нууц үг дор хаяж 8 тэмдэгт')
  .max(128, 'Нууц үг хэт урт');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Нэвтрэлтийн хариу (token-ууд + хэрэглэгчийн товч мэдээлэл) */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
