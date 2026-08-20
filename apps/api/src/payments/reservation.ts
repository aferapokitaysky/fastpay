import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "../db/client.js";
import { orderItems } from "../db/schema.js";
import * as schema from "../db/schema.js";
import { ConflictError, BadRequestError } from "../middleware/errorHandler.js";

/** How long a reservation holds an item before it's treated as free again (lazy expiry, no cron — see reserveOrderItems doc comment). */
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

type DbOrTx = NodePgDatabase<typeof schema>;

/**
 * Reserves a set of order_items for a PaymentIntent that already exists as
 * a row (its FK requires that — `order_items.reserved_by_payment_intent_id`
 * references `payment_intents.id`). Callers run this inside the SAME
 * transaction that inserted the payment_intents row — see
 * routes/publicPaymentIntents.ts, which does: insert intent (placeholder
 * amount) -> reserveOrderItems(tx, ...) -> update intent with the computed
 * amount -> insert payment_intent_items, all in one `db.transaction`. If
 * reservation fails, the whole transaction rolls back, including the
 * payment_intents insert, so there's never an orphaned intent row.
 *
 * `SELECT ... FOR UPDATE` row-locks every target item before deciding
 * whether the reservation is allowed — this (not an app-level check alone)
 * is what actually prevents two guests reserving the same item, matching
 * the B1 pattern for the one-active-order-per-table race.
 *
 * Expiry is lazy: a row with `reservedUntil < now()` is treated as free by
 * the check below, so an expired reservation clears itself the next time
 * anyone tries to use that item — no separate cron worker exists for this
 * in B2 (documented simplification, not an oversight; a periodic sweep
 * could be added later purely for read-freshness, it doesn't change
 * correctness since the check is inline on every write).
 *
 * Throws ConflictError if any target item is already paid or held by a
 * different live reservation, or BadRequestError if an id doesn't belong
 * to `orderId` at all — the whole batch is all-or-nothing so a guest never
 * ends up with a partial reservation.
 */
export async function reserveOrderItems(
  tx: DbOrTx,
  paymentIntentId: string,
  orderId: string,
  orderItemIds: string[],
): Promise<{ orderItemId: string; amountKopecks: number }[]> {
  if (orderItemIds.length === 0) {
    throw new BadRequestError("NO_PAYABLE_ITEMS", "No order items to reserve");
  }

  const rows = await tx
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      unitPriceKopecks: orderItems.unitPriceKopecksSnapshot,
      quantity: orderItems.quantity,
      paymentStatus: orderItems.paymentStatus,
      reservedByPaymentIntentId: orderItems.reservedByPaymentIntentId,
      reservedUntil: orderItems.reservedUntil,
    })
    .from(orderItems)
    .where(inArray(orderItems.id, orderItemIds))
    .for("update");

  if (rows.length !== orderItemIds.length) {
    throw new BadRequestError("ORDER_ITEM_NOT_FOUND", "One or more order items do not exist");
  }

  const now = new Date();
  for (const row of rows) {
    if (row.orderId !== orderId) {
      throw new BadRequestError(
        "ORDER_ITEM_NOT_IN_ORDER",
        `Order item ${row.id} does not belong to this order`,
      );
    }
    if (row.paymentStatus === "paid") {
      throw new ConflictError("ITEM_RESERVED_OR_PAID", `Order item ${row.id} is already paid`);
    }
    const heldByAnother =
      row.reservedByPaymentIntentId !== null &&
      row.reservedByPaymentIntentId !== paymentIntentId &&
      row.reservedUntil !== null &&
      row.reservedUntil > now;
    if (heldByAnother) {
      throw new ConflictError(
        "ITEM_RESERVED_OR_PAID",
        `Order item ${row.id} is already being paid by someone else`,
      );
    }
  }

  const reservedUntil = new Date(now.getTime() + RESERVATION_TTL_MS);
  await tx
    .update(orderItems)
    .set({ reservedByPaymentIntentId: paymentIntentId, reservedUntil })
    .where(inArray(orderItems.id, orderItemIds));

  return rows.map((row) => ({
    orderItemId: row.id,
    amountKopecks: row.unitPriceKopecks * row.quantity,
  }));
}

/**
 * Every order_item on `orderId` that's currently payable: not paid, and not
 * held by a live reservation from a different intent (or any intent, if
 * `excludePaymentIntentId` is omitted). Used to resolve `itemIds: "all"`.
 */
export async function listPayableOrderItemIds(orderId: string): Promise<string[]> {
  const now = new Date();
  const rows = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        sql`${orderItems.paymentStatus} <> 'paid'`,
        or(isNull(orderItems.reservedByPaymentIntentId), lt(orderItems.reservedUntil, now)),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Releases every order_item reserved by this intent (sets both reservation
 * columns back to null) — called when an intent resolves to
 * failed/expired/cancelled, so the items become payable again immediately
 * rather than waiting out the TTL. Idempotent: safe to call even if nothing
 * is currently reserved by this intent.
 */
export async function releaseReservation(tx: DbOrTx, paymentIntentId: string): Promise<void> {
  await tx
    .update(orderItems)
    .set({ reservedByPaymentIntentId: null, reservedUntil: null })
    .where(eq(orderItems.reservedByPaymentIntentId, paymentIntentId));
}
