import { z } from 'zod';

/**
 * Орчны хувьсагчийн баталгаажуулалт — CLAUDE.md §11 (secret env-д), §16.6.
 * Апп асах үед бүх шаардлагатай хувьсагч байгаа эсэхийг шалгана (fail-fast).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(8, 'JWT_ACCESS_SECRET дор хаяж 8 тэмдэгт'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET дор хаяж 8 тэмдэгт'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOKI_URL: z.string().optional(),

  // И-баримт — CLAUDE.md §12 (official posapi спецээс)
  EBARIMT_ENABLED: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true')
    .default(false),
  EBARIMT_BASE_URL: z.string().optional(),
  EBARIMT_MERCHANT_TIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** ConfigModule.forRoot({ validate }) -д өгөх баталгаажуулагч */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Орчны хувьсагч буруу байна:\n${issues}`);
  }
  return parsed.data;
}
