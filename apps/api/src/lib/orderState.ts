import { eq } from "drizzle-orm";
import type { StaffOrder, StaffOrderItem } from "@fastpay/contracts";
import { db } from "../db/client.js";
import { orderItems, orders } from "../db/schema.js";
import { NotFoundError } from "../middleware/errorHandler.js";

// Single-currency MVP, matches routes/publicBill.ts.
const CURRENCY = "UAH";

/**
 * Recomputes the order total from item snapshots on every read — never
 * trust a client-sent total (docs/architecture/DOMAIN_AND_ARCHITECTURE.md
 * "Требования к транзакциям" #1). No payment/allocation tracking exists yet
 * (B2), so outstandingFoodKopecks == totalFoodKopecks for every order,
 * exactly like the public bill endpoint.
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

  return {
    id: order.id,
    tableId: order.tableId,
    status: order.status,
    version: order.version,
    items,
    totalFoodKopecks,
    // No allocation tracking yet (B2): every item is fully outstanding.
    outstandingFoodKopecks: totalFoodKopecks,
    currency: CURRENCY,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
