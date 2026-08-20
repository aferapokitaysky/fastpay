import type { FastifyInstance } from "fastify";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  PublicBillResponseSchema,
  type PublicBillResponse,
  type PublicOrder,
  type PublicTips,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { floors, orderItems, orders, tables, venues } from "../db/schema.js";
import { NotFoundError } from "../middleware/errorHandler.js";

// Static MVP tip defaults — no per-venue tip configuration exists yet.
const TIPS: PublicTips = { percentOptions: [5, 10, 15], customAllowed: true };

// Single-currency MVP — see docs/PRODUCT_SPEC_MVP.md section 3 (Organization: валюта UAH).
const CURRENCY = "UAH";

export async function publicBillRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>(
    "/v1/public/tables/:token/bill",
    async (request) => {
      const { token } = request.params;

      const [table] = await db
        .select({
          id: tables.id,
          label: tables.label,
          floorId: tables.floorId,
        })
        .from(tables)
        .where(eq(tables.qrToken, token))
        .limit(1);

      if (!table) {
        throw new NotFoundError("TABLE_NOT_FOUND", "No table matches this QR token");
      }

      const [floor] = await db
        .select({ venueId: floors.venueId })
        .from(floors)
        .where(eq(floors.id, table.floorId))
        .limit(1);

      // Data integrity guard: a table must always resolve to a venue via its
      // floor. If this ever fails it indicates orphaned seed/demo data, not
      // a guest-facing 404 case.
      if (!floor) {
        throw new NotFoundError("TABLE_NOT_FOUND", "No table matches this QR token");
      }

      const [venue] = await db
        .select({ name: venues.name, logoUrl: venues.logoUrl })
        .from(venues)
        .where(eq(venues.id, floor.venueId))
        .limit(1);

      if (!venue) {
        throw new NotFoundError("TABLE_NOT_FOUND", "No table matches this QR token");
      }

      // A table has at most one active (non-closed) order.
      const [activeOrder] = await db
        .select({
          id: orders.id,
          status: orders.status,
          version: orders.version,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(and(eq(orders.tableId, table.id), ne(orders.status, "closed")))
        .orderBy(desc(orders.createdAt))
        .limit(1);

      let order: PublicBillResponse["order"] = null;

      if (activeOrder) {
        const items = await db
          .select({
            id: orderItems.id,
            name: orderItems.nameSnapshot,
            quantity: orderItems.quantity,
            unitPriceKopecks: orderItems.unitPriceKopecksSnapshot,
            paymentStatus: orderItems.paymentStatus,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, activeOrder.id));

        const publicItems = items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPriceKopecks: item.unitPriceKopecks,
          // No payment/allocation tracking yet: every item is fully outstanding.
          remainingKopecks: item.unitPriceKopecks * item.quantity,
          paymentStatus: item.paymentStatus,
        }));

        const outstandingFoodKopecks = publicItems.reduce(
          (sum, item) => sum + item.remainingKopecks,
          0,
        );

        order = {
          id: activeOrder.id,
          // Safe: the query above filters out status "closed" (ne(orders.status, "closed")),
          // which the orders.status column type doesn't encode.
          status: activeOrder.status as PublicOrder["status"],
          version: activeOrder.version,
          items: publicItems,
          outstandingFoodKopecks,
          currency: CURRENCY,
          updatedAt: activeOrder.updatedAt.toISOString(),
        };
      }

      const payload: PublicBillResponse = {
        venue: { name: venue.name, logoUrl: venue.logoUrl },
        table: { label: table.label },
        order,
        tips: TIPS,
      };

      return PublicBillResponseSchema.parse(payload);
    },
  );
}
