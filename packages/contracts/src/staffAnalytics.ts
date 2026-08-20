import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";

/**
 * GET /v1/staff/venues/:id/analytics/daily — owner/manager only. Everything
 * here is computed server-side from payment_intents/order_items/orders for
 * a single calendar day, never client-supplied. `date` is interpreted as a
 * UTC calendar day (00:00:00.000Z .. 23:59:59.999Z) — a documented
 * simplification, not a timezone-aware "restaurant's local day" (see
 * routes/staffAnalytics.ts).
 */
export const DailyAnalyticsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});
export type DailyAnalyticsQuery = z.infer<typeof DailyAnalyticsQuerySchema>;

export const PopularItemSchema = z.object({
  menuItemId: z.string().uuid().nullable(),
  name: z.string(),
  quantitySold: z.number().int().nonnegative(),
  revenueKopecks: MoneyKopecksSchema,
});
export type PopularItem = z.infer<typeof PopularItemSchema>;

/**
 * `staffId: null` buckets orders with no `openedByStaffId` attribution —
 * every order created before the B3 migration, plus any future edge case
 * where attribution is missing. Never silently dropped from the total.
 */
export const StaffPerformanceEntrySchema = z.object({
  staffId: z.string().uuid().nullable(),
  staffName: z.string(),
  ordersOpened: z.number().int().nonnegative(),
  revenueKopecks: MoneyKopecksSchema,
});
export type StaffPerformanceEntry = z.infer<typeof StaffPerformanceEntrySchema>;

export const DailyAnalyticsResponseSchema = z.object({
  date: z.string(),
  venueId: z.string().uuid(),
  revenueKopecks: MoneyKopecksSchema,
  tipsKopecks: MoneyKopecksSchema,
  averageCheckKopecks: MoneyKopecksSchema,
  closedTablesCount: z.number().int().nonnegative(),
  popularItems: z.array(PopularItemSchema),
  staffPerformance: z.array(StaffPerformanceEntrySchema),
});
export type DailyAnalyticsResponse = z.infer<typeof DailyAnalyticsResponseSchema>;
