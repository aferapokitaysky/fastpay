import type { FastifyInstance } from "fastify";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  DailyAnalyticsQuerySchema,
  DailyAnalyticsResponseSchema,
  type DailyAnalyticsResponse,
  type PopularItem,
  type StaffPerformanceEntry,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { floors, orderItems, orders, paymentIntents, staff, tables, venues } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { assertVenueAccess, getOrgVenueOrThrow } from "../lib/scoping.js";
import { BadRequestError } from "../middleware/errorHandler.js";

/**
 * GET /v1/staff/venues/:id/analytics/daily — owner/manager only, per
 * docs/IMPLEMENTATION_PLANS.md "B3". Everything is recomputed from
 * payment_intents/order_items/orders on every request — no materialized
 * rollup table exists yet, which is fine at MVP scale (see
 * docs/PRODUCT_SPEC_MVP.md "не строим то, что не нужно на 1 версии").
 *
 * Simplification, documented rather than hidden: "day" is a fixed UTC
 * calendar day (00:00:00.000Z .. 23:59:59.999Z), not the venue's local
 * timezone. Every metric below is anchored to whichever timestamp actually
 * marks the event it's counting — payment_intents.updatedAt for money that
 * moved, orders.createdAt for tables opened, orders.updatedAt for tables
 * closed — there's no separate "occurred at" column for any of these, so
 * the last-write timestamp is the closest available proxy. Two staff
 * members can therefore show activity that straddles midnight slightly
 * differently across metrics; not worth a schema change for v1.
 */
export async function staffAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    "/v1/staff/venues/:id/analytics/daily",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const venue = await getOrgVenueOrThrow(request.params.id, organizationId);
      assertVenueAccess(request.staff!, venue.id);

      const query = DailyAnalyticsQuerySchema.parse(request.query);
      const start = new Date(`${query.date}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestError("INVALID_DATE", "date must be a valid calendar date");
      }
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

      const succeededIntents = await db
        .select({
          amountFoodKopecks: paymentIntents.amountFoodKopecks,
          amountTipKopecks: paymentIntents.amountTipKopecks,
          orderId: paymentIntents.orderId,
          openedByStaffId: orders.openedByStaffId,
        })
        .from(paymentIntents)
        .innerJoin(orders, eq(orders.id, paymentIntents.orderId))
        .innerJoin(tables, eq(tables.id, orders.tableId))
        .innerJoin(floors, eq(floors.id, tables.floorId))
        .innerJoin(venues, eq(venues.id, floors.venueId))
        .where(
          and(
            eq(venues.id, venue.id),
            eq(paymentIntents.status, "succeeded"),
            gte(paymentIntents.updatedAt, start),
            lte(paymentIntents.updatedAt, end),
          ),
        );

      const revenueKopecks = succeededIntents.reduce((sum, row) => sum + row.amountFoodKopecks, 0);
      const tipsKopecks = succeededIntents.reduce((sum, row) => sum + row.amountTipKopecks, 0);
      const paidOrderIds = new Set(succeededIntents.map((row) => row.orderId));
      const averageCheckKopecks =
        paidOrderIds.size > 0 ? Math.round(revenueKopecks / paidOrderIds.size) : 0;

      const staffRevenue = new Map<string | null, number>();
      for (const row of succeededIntents) {
        const key = row.openedByStaffId;
        staffRevenue.set(key, (staffRevenue.get(key) ?? 0) + row.amountFoodKopecks);
      }

      const closedOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .innerJoin(tables, eq(tables.id, orders.tableId))
        .innerJoin(floors, eq(floors.id, tables.floorId))
        .innerJoin(venues, eq(venues.id, floors.venueId))
        .where(
          and(
            eq(venues.id, venue.id),
            eq(orders.status, "closed"),
            gte(orders.updatedAt, start),
            lte(orders.updatedAt, end),
          ),
        );
      const closedTablesCount = closedOrders.length;

      const paidItemRows = await db
        .select({
          menuItemId: orderItems.menuItemId,
          name: orderItems.nameSnapshot,
          quantity: orderItems.quantity,
          unitPriceKopecksSnapshot: orderItems.unitPriceKopecksSnapshot,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(tables, eq(tables.id, orders.tableId))
        .innerJoin(floors, eq(floors.id, tables.floorId))
        .innerJoin(venues, eq(venues.id, floors.venueId))
        .where(
          and(
            eq(venues.id, venue.id),
            eq(orderItems.paymentStatus, "paid"),
            gte(orderItems.updatedAt, start),
            lte(orderItems.updatedAt, end),
          ),
        );

      // Grouped by menuItemId when present; a deleted menu item leaves
      // menuItemId null on the order_item (see schema.ts's onDelete:
      // "set null"), so those group by name instead rather than being
      // silently merged into one bucket.
      const popularByKey = new Map<string, PopularItem>();
      for (const row of paidItemRows) {
        const key = row.menuItemId ?? `name:${row.name}`;
        const existing = popularByKey.get(key);
        const revenue = row.unitPriceKopecksSnapshot * row.quantity;
        if (existing) {
          existing.quantitySold += row.quantity;
          existing.revenueKopecks += revenue;
        } else {
          popularByKey.set(key, {
            menuItemId: row.menuItemId,
            name: row.name,
            quantitySold: row.quantity,
            revenueKopecks: revenue,
          });
        }
      }
      const popularItems = [...popularByKey.values()]
        .sort((a, b) => b.quantitySold - a.quantitySold)
        .slice(0, 5);

      const openedOrders = await db
        .select({ openedByStaffId: orders.openedByStaffId })
        .from(orders)
        .innerJoin(tables, eq(tables.id, orders.tableId))
        .innerJoin(floors, eq(floors.id, tables.floorId))
        .innerJoin(venues, eq(venues.id, floors.venueId))
        .where(
          and(eq(venues.id, venue.id), gte(orders.createdAt, start), lte(orders.createdAt, end)),
        );

      const ordersOpened = new Map<string | null, number>();
      for (const row of openedOrders) {
        const key = row.openedByStaffId;
        ordersOpened.set(key, (ordersOpened.get(key) ?? 0) + 1);
      }

      const staffIds = [...new Set([...staffRevenue.keys(), ...ordersOpened.keys()].filter((id): id is string => id !== null))];
      const staffRows = staffIds.length > 0
        ? await db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, staffIds))
        : [];
      const staffNameById = new Map(staffRows.map((row) => [row.id, row.name]));

      const staffKeys = new Set<string | null>([...staffRevenue.keys(), ...ordersOpened.keys()]);
      const staffPerformance: StaffPerformanceEntry[] = [...staffKeys]
        .map((staffId) => ({
          staffId,
          staffName: staffId ? (staffNameById.get(staffId) ?? "Unknown staff") : "Unattributed",
          ordersOpened: ordersOpened.get(staffId) ?? 0,
          revenueKopecks: staffRevenue.get(staffId) ?? 0,
        }))
        .sort((a, b) => b.revenueKopecks - a.revenueKopecks);

      const response: DailyAnalyticsResponse = {
        date: query.date,
        venueId: venue.id,
        revenueKopecks,
        tipsKopecks,
        averageCheckKopecks,
        closedTablesCount,
        popularItems,
        staffPerformance,
      };
      return DailyAnalyticsResponseSchema.parse(response);
    },
  );
}
