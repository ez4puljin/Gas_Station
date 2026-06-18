import { z } from 'zod';
import { PaymentMethod, SaleStatus, StockMovementType } from '@fuel/types';
import { stationIdSchema } from './common';

/** Огноо YYYY-MM-DD (Asia/Ulaanbaatar бизнесийн өдөр) */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо YYYY-MM-DD форматтай байх ёстой');

export const dailyReportQuerySchema = z.object({
  stationId: stationIdSchema,
  date: dateOnlySchema,
});
export type DailyReportQuery = z.infer<typeof dailyReportQuerySchema>;

export const consolidatedQuerySchema = z.object({
  date: dateOnlySchema,
});
export type ConsolidatedQuery = z.infer<typeof consolidatedQuerySchema>;

/** KPI — огноо заавал биш (default: UB өнөөдөр) */
export const kpiQuerySchema = z.object({
  date: dateOnlySchema.optional(),
});
export type KpiQuery = z.infer<typeof kpiQuerySchema>;

export const rangeQuerySchema = z
  .object({
    stationId: stationIdSchema,
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export const anomalyQuerySchema = z
  .object({
    stationId: stationIdSchema.optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type AnomalyQuery = z.infer<typeof anomalyQuerySchema>;

/** Огнооны муж — салбар сонголттой (байхгүй бол хандах эрхтэй бүх салбар). */
export const optionalStationRangeSchema = z
  .object({
    stationId: stationIdSchema.optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type OptionalStationRange = z.infer<typeof optionalStationRangeSchema>;

/** Борлуулалтын тайлан (муж + шүүлтүүр) — НӨАТ тайлан, харилцагч/түлш/бараагаар. */
export const salesReportQuerySchema = z
  .object({
    stationId: stationIdSchema.optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
    cashierId: z.string().optional(),
    customerId: z.string().optional(),
    fuelGradeId: z.string().optional(),
    productId: z.string().optional(),
    method: z.nativeEnum(PaymentMethod).optional(),
    status: z.nativeEnum(SaleStatus).optional(),
    search: z.string().optional(),
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;

/** Ээлжийн түүх — муж + салбар/кассчин сонголттой. */
export const shiftReportQuerySchema = z
  .object({
    stationId: stationIdSchema.optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
    cashierId: z.string().optional(),
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type ShiftReportQuery = z.infer<typeof shiftReportQuerySchema>;

/** Түлшний нийлүүлэлт / нийлүүлэгчийн тайлан. */
export const deliveryReportQuerySchema = z
  .object({
    stationId: stationIdSchema.optional(),
    from: dateOnlySchema,
    to: dateOnlySchema,
    supplierId: z.string().optional(),
    fuelGradeId: z.string().optional(),
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type DeliveryReportQuery = z.infer<typeof deliveryReportQuerySchema>;

/** Нөөцийн хөдөлгөөний тайлан (муж + төрөл/бараа шүүлт). */
export const movementReportQuerySchema = z
  .object({
    stationId: stationIdSchema,
    from: dateOnlySchema,
    to: dateOnlySchema,
    type: z.nativeEnum(StockMovementType).optional(),
    productId: z.string().optional(),
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type MovementReportQuery = z.infer<typeof movementReportQuerySchema>;

/** Нөөцийн үнэлгээ — тухайн агшны (одоогийн) үлдэгдэл × өртөг. */
export const valuationQuerySchema = z.object({ stationId: stationIdSchema });
export type ValuationQuery = z.infer<typeof valuationQuerySchema>;

/** Түлшний дэвтэр-vs-бодит тулгалт (хорогдол) — нэг салбар, муж. */
export const fuelReconQuerySchema = z
  .object({
    stationId: stationIdSchema,
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((d) => d.from <= d.to, { message: 'from нь to-оос хойш байж болохгүй' });
export type FuelReconQuery = z.infer<typeof fuelReconQuerySchema>;
