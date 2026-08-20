import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";
import { OrderItemPaymentStatusSchema } from "./publicBill.js";

/**
 * Full order lifecycle per docs/PRODUCT_SPEC_MVP.md section 4. Unlike the
 * public bill contract (which never surfaces "closed"), staff endpoints
 * need the whole enum.
 */
export const StaffOrderStatusSchema = z.enum([
  "draft",
  "open",
  "bill_requested",
  "payment_pending",
  "partially_paid",
  "paid",
  "closed",
]);
export type StaffOrderStatus = z.infer<typeof StaffOrderStatusSchema>;

/**
 * Statuses in which PATCH /v1/staff/orders/:id (item add/update/remove) is
 * allowed. Decision made in B1 (flagging for sign-off, same pattern as
 * COM-003): the product spec doesn't pin this down explicitly. We allow
 * edits through "open" and "bill_requested" — a waiter can still fix an
 * item after the guest asks for the bill but before any payment has
 * started. Editing is blocked once a payment is in flight
 * (payment_pending/partially_paid/paid) or the order is closed.
 */
export const ORDER_EDITABLE_STATUSES: StaffOrderStatus[] = ["open", "bill_requested"];

export const StaffOrderItemSchema = z.object({
  id: z.string().uuid(),
  menuItemId: z.string().uuid().nullable(),
  name: z.string(),
  unitPriceKopecks: MoneyKopecksSchema,
  quantity: z.number().int().positive(),
  comment: z.string().nullable(),
  paymentStatus: OrderItemPaymentStatusSchema,
  lineTotalKopecks: MoneyKopecksSchema,
});
export type StaffOrderItem = z.infer<typeof StaffOrderItemSchema>;

export const StaffOrderSchema = z.object({
  id: z.string().uuid(),
  tableId: z.string().uuid(),
  status: StaffOrderStatusSchema,
  version: z.number().int().nonnegative(),
  items: z.array(StaffOrderItemSchema),
  totalFoodKopecks: MoneyKopecksSchema,
  outstandingFoodKopecks: MoneyKopecksSchema,
  currency: z.string().length(3),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StaffOrder = z.infer<typeof StaffOrderSchema>;

/** POST /v1/staff/tables/:id/orders — no body. */
export const OpenOrderResponseSchema = StaffOrderSchema;
export type OpenOrderResponse = z.infer<typeof OpenOrderResponseSchema>;

/**
 * PATCH /v1/staff/orders/:id
 * `version` must match the server's current order.version (optimistic
 * concurrency) — a stale version returns 409 ORDER_VERSION_CONFLICT with the
 * current server state as `details.currentOrder`. All operations in one
 * PATCH call are applied atomically and count as a single version bump.
 */
export const OrderItemOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    menuItemId: z.string().uuid(),
    quantity: z.number().int().positive(),
    comment: z.string().max(500).nullable().optional(),
  }),
  z.object({
    type: z.literal("update"),
    orderItemId: z.string().uuid(),
    quantity: z.number().int().positive().optional(),
    comment: z.string().max(500).nullable().optional(),
  }),
  z.object({
    type: z.literal("remove"),
    orderItemId: z.string().uuid(),
  }),
]);
export type OrderItemOperation = z.infer<typeof OrderItemOperationSchema>;

export const UpdateOrderRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  operations: z.array(OrderItemOperationSchema).min(1),
});
export type UpdateOrderRequest = z.infer<typeof UpdateOrderRequestSchema>;

export const UpdateOrderResponseSchema = StaffOrderSchema;
export type UpdateOrderResponse = z.infer<typeof UpdateOrderResponseSchema>;

/** POST /v1/staff/orders/:id/request-bill */
export const RequestBillRequestSchema = z.object({
  version: z.number().int().nonnegative(),
});
export type RequestBillRequest = z.infer<typeof RequestBillRequestSchema>;

export const RequestBillResponseSchema = StaffOrderSchema;
export type RequestBillResponse = z.infer<typeof RequestBillResponseSchema>;

/**
 * POST /v1/staff/orders/:id/close
 * A plain waiter may only close when outstandingFoodKopecks === 0. A
 * nonzero balance requires role manager/owner and a non-empty `reason`,
 * which is written to audit_events (action: "order.closed_with_balance").
 */
export const CloseOrderRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500).optional(),
});
export type CloseOrderRequest = z.infer<typeof CloseOrderRequestSchema>;

export const CloseOrderResponseSchema = StaffOrderSchema;
export type CloseOrderResponse = z.infer<typeof CloseOrderResponseSchema>;

/**
 * 409 ORDER_VERSION_CONFLICT error `details` shape — the current server
 * order is included so the client can resync without a second round trip.
 */
export const OrderVersionConflictDetailsSchema = z.object({
  currentOrder: StaffOrderSchema,
});
export type OrderVersionConflictDetails = z.infer<typeof OrderVersionConflictDetailsSchema>;
