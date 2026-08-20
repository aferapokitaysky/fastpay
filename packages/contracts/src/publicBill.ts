import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";

/**
 * Order lifecycle, per docs/PRODUCT_SPEC_MVP.md section 4:
 *   draft -> open -> bill_requested -> payment_pending -> partially_paid -> paid -> closed
 * The public bill endpoint only ever surfaces a non-closed order.
 */
export const OrderStatusSchema = z.enum([
  "draft",
  "open",
  "bill_requested",
  "payment_pending",
  "partially_paid",
  "paid",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderItemPaymentStatusSchema = z.enum(["unpaid", "partial", "paid"]);
export type OrderItemPaymentStatus = z.infer<typeof OrderItemPaymentStatusSchema>;

export const PublicVenueSchema = z.object({
  name: z.string(),
  logoUrl: z.string().url().nullable(),
});
export type PublicVenue = z.infer<typeof PublicVenueSchema>;

export const PublicTableSchema = z.object({
  label: z.string(),
});
export type PublicTable = z.infer<typeof PublicTableSchema>;

export const PublicOrderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceKopecks: MoneyKopecksSchema,
  remainingKopecks: MoneyKopecksSchema,
  paymentStatus: OrderItemPaymentStatusSchema,
});
export type PublicOrderItem = z.infer<typeof PublicOrderItemSchema>;

export const PublicOrderSchema = z.object({
  id: z.string(),
  status: OrderStatusSchema,
  version: z.number().int().nonnegative(),
  items: z.array(PublicOrderItemSchema),
  outstandingFoodKopecks: MoneyKopecksSchema,
  currency: z.string().length(3),
  updatedAt: z.string().datetime(),
});
export type PublicOrder = z.infer<typeof PublicOrderSchema>;

export const PublicTipsSchema = z.object({
  percentOptions: z.array(z.number().int().nonnegative()),
  customAllowed: z.boolean(),
});
export type PublicTips = z.infer<typeof PublicTipsSchema>;

/**
 * GET /v1/public/tables/:token/bill
 *
 * `order` is `null` when the table has no active (non-closed) order — the
 * contract doc does not pin this case down explicitly; see HANDOFF note.
 */
export const PublicBillResponseSchema = z.object({
  venue: PublicVenueSchema,
  table: PublicTableSchema,
  order: PublicOrderSchema.nullable(),
  tips: PublicTipsSchema,
});
export type PublicBillResponse = z.infer<typeof PublicBillResponseSchema>;
