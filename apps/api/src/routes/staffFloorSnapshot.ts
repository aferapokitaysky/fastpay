import type { FastifyInstance } from "fastify";
import { and, eq, inArray, ne } from "drizzle-orm";
import { StaffFloorSnapshotResponseSchema } from "@fastpay/contracts";
import { db } from "../db/client.js";
import { floors, orderItems, orders, tables, venues } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

/** A waiter-safe read model for the staff PWA floor. No QR tokens or payment data are exposed. */
export async function staffFloorSnapshotRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/staff/floor", { preHandler: [requireAuth] }, async (request) => {
    const session = request.staff!;
    const venueRows = session.venueId ? [{ id: session.venueId }] : await db.select({ id: venues.id }).from(venues).where(eq(venues.organizationId, session.organizationId));
    const venueIds = venueRows.map((venue) => venue.id);
    if (!venueIds.length) return StaffFloorSnapshotResponseSchema.parse({ floors: [] });
    const floorRows = await db.select().from(floors).where(inArray(floors.venueId, venueIds));
    const floorIds = floorRows.map((floor) => floor.id);
    if (!floorIds.length) return StaffFloorSnapshotResponseSchema.parse({ floors: [] });
    const tableRows = await db.select().from(tables).where(inArray(tables.floorId, floorIds));
    const tableIds = tableRows.map((table) => table.id);
    const orderRows = tableIds.length ? await db.select().from(orders).where(and(inArray(orders.tableId, tableIds), ne(orders.status, "closed"))) : [];
    const itemRows = orderRows.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderRows.map((order) => order.id))) : [];
    const totalByOrder = new Map<string, number>();
    for (const item of itemRows) totalByOrder.set(item.orderId, (totalByOrder.get(item.orderId) ?? 0) + item.unitPriceKopecksSnapshot * item.quantity);
    const orderByTable = new Map(orderRows.map((order) => [order.tableId, order]));
    return StaffFloorSnapshotResponseSchema.parse({ floors: floorRows.map((floor) => ({ id: floor.id, name: floor.name, tables: tableRows.filter((table) => table.floorId === floor.id).map((table) => { const order = orderByTable.get(table.id); return { id: table.id, label: table.label, status: table.status, activeOrder: order ? { id: order.id, status: order.status, version: order.version, outstandingFoodKopecks: totalByOrder.get(order.id) ?? 0, updatedAt: order.updatedAt.toISOString() } : null }; }) })) });
  });
}
