import { z } from 'zod';

/** cuid/uuid id */
export const idSchema = z.string().min(1, 'id шаардлагатай');

/** Салбарын id — CLAUDE.md §10 (бүх query scope) */
export const stationIdSchema = z.string().min(1, 'stationId шаардлагатай');

/** Хуудаслалт */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

/** ISO-8601 огноо (UTC) — CLAUDE.md §2.8 */
export const isoDateSchema = z.string().datetime({ message: 'Огноо ISO-8601 байх ёстой' });

/** Засвар/adjustment-д заавал шаардагдах шалтгаан — CLAUDE.md §2.7 */
export const reasonSchema = z.string().min(3, 'Шалтгаан дор хаяж 3 тэмдэгт байх ёстой');
