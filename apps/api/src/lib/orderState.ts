import { and, eq, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StaffOrder, StaffOrderItem } from "@fastpay/contracts";
import { db } from "../db/client.js";
import { floors, orderItems, orders, tables, venues } from "../db/schema.js";
import * as schema from "../db/schema.js";
import { NotFoundError } from "../middleware/errorHandler.js";

type DbOrTx = NodePgDatabase<typeof schema>;

// Single-currency MVP, matches routes/publicBill.ts.
const CURRENCY = "UAH";

/**
 * Recomputes the order total from item snapshots on every read — never
 * trust a client-sent total (docs/architecture/DOMAIN_AND_ARCHITECTURE.md
 * "Требования к транзакциям" #1). `outstandingFoodKopecks` excludes items
 * whose `paymentStatus` is `paid` (set by the B2 webhook consumer — see
 * routes/webhooks.ts) — there is no partial-item-amount tracking in this
 * MVP (see payment_intent_items doc comment in db/schema.ts), so an item is
 * either fully outstanding or fully paid, never partially.
 */
export async function loadStaffOrder(orderId: string): Promise<StaffOrder> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    throw new NotFoundError("ORDER_NOT_FOUND", "No order matches this id");
  }

  const rows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  const items: StaffOrderItem[] = rows.map((row) => ({
    id: row.id,
    menuItemId: row.menuItemId,
    name: row.nameSnapshot,
    unitPriceKopecks: row.unitPriceKopecksSnapshot,
    quantity: row.quantity,
    comment: row.comment,
    paymentStatus: row.paymentStatus,
    lineTotalKopecks: row.unitPriceKopecksSnapshot * row.quantity,
  }));

  const totalFoodKopecks = items.reduce((sum, item) => sum + item.lineTotalKopecks, 0);
  const outstandingFoodKopecks = items
    .filter((item) => item.paymentStatus !== "paid")
    .reduce((sum, item) => sum + item.lineTotalKopecks, 0);

  return {
    id: order.id,
    tableId: order.tableId,
    status: order.status,
    version: order.version,
    items,
    totalFoodKopecks,
    outstandingFoodKopecks,
    currency: CURRENCY,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Called after a webhook marks one or more order_items paid (see
 * routes/webhooks.ts). Only ever moves the order status *forward* toward
 * payment completion (`partially_paid` -> `paid`); it never touches
 * `draft`/`open`/`bill_requested` — those are staff-driven transitions
 * (routes/staffOrders.ts) unrelated to payment progress, and this is only
 * called once at least one item has actually been paid.
 */
export async function recomputeOrderPaymentStatus(tx: DbOrTx, orderId: string): Promise<void> {
  const [unpaid] = await tx
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), ne(orderItems.paymentStatus, "paid")))
    .limit(1);

  // Bumps version like every other order mutation (routes/staffOrders.ts) so
  // a staff client polling with a stale `version` gets 409 ORDER_VERSION_CONFLICT
  // and resyncs, instead of silently overwriting a payment that landed
  // between their read and their next PATCH.
  await tx
    .update(orders)
    .set({ status: unpaid ? "partially_paid" : "paid", version: sql`${orders.version} + 1` })
    .where(eq(orders.id, orderId));
}

/**
 * Resolves an order's venue + table (id + label), via the same
 * order -> table -> floor -> venue join chain as lib/scoping.ts. Used by the
 * realtime outbox writers (routes/staffOrders.ts, routes/publicPaymentIntents.ts,
 * routes/webhooks.ts) — every realtime_events row needs a venueId to route
 * delivery and a tableId/label to render, and none of those callers already
 * have both on hand.
 */
export async function getOrderVenueAndTable(
  orderId: string,
): Promise<{ venueId: string; tableId: string; tableLabel: string } | null> {
  const [row] = await db
    .select({ venueId: venues.id, tableId: tables.id, tableLabel: tables.label })
    .from(orders)
    .innerJoin(tables, eq(tables.id, orders.tableId))
    .innerJoin(floors, eq(floors.id, tables.floorId))
    .innerJoin(venues, eq(venues.id, floors.venueId))
    .where(eq(orders.id, orderId))
    .limit(1);
  return row ?? null;
}
