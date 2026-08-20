import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  CreateMenuItemRequestSchema,
  ListMenuItemsResponseSchema,
  StaffMenuItemSchema,
  UpdateMenuItemRequestSchema,
  type StaffMenuItem,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { menuItems } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgMenuItemOrThrow, getOrgVenueOrThrow } from "../lib/scoping.js";
import { recordAuditEvent } from "../lib/audit.js";

function toStaffMenuItem(row: typeof menuItems.$inferSelect): StaffMenuItem {
  return {
    id: row.id,
    venueId: row.venueId,
    name: row.name,
    unitPriceKopecks: row.unitPriceKopecks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Menu items: create/list under a venue, update — owner/manager only.
 * Updating price never touches order_items.unit_price_kopecks_snapshot on
 * existing orders (those are point-in-time snapshots, immutable after
 * creation — see routes/staffOrders.ts). A price change writes an audit row.
 */
export async function staffMenuItemsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { venueId: string } }>(
    "/v1/staff/venues/:venueId/menu-items",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request, reply) => {
      const { organizationId } = request.staff!;
      const body = CreateMenuItemRequestSchema.parse(request.body);
      const venue = await getOrgVenueOrThrow(request.params.venueId, organizationId);

      const [row] = await db
        .insert(menuItems)
        .values({ venueId: venue.id, name: body.name, unitPriceKopecks: body.unitPriceKopecks })
        .returning();
      if (!row) throw new Error("Failed to create menu item");

      reply.status(201);
      return StaffMenuItemSchema.parse(toStaffMenuItem(row));
    },
  );

  app.get<{ Params: { venueId: string } }>(
    "/v1/staff/venues/:venueId/menu-items",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const venue = await getOrgVenueOrThrow(request.params.venueId, organizationId);
      const rows = await db.select().from(menuItems).where(eq(menuItems.venueId, venue.id));
      return ListMenuItemsResponseSchema.parse({ menuItems: rows.map(toStaffMenuItem) });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/staff/menu-items/:id",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId, staffId } = request.staff!;
      const body = UpdateMenuItemRequestSchema.parse(request.body);
      const existing = await getOrgMenuItemOrThrow(request.params.id, organizationId);

      const priceChanged =
        body.unitPriceKopecks !== undefined && body.unitPriceKopecks !== existing.unitPriceKopecks;

      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(menuItems)
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.unitPriceKopecks !== undefined
              ? { unitPriceKopecks: body.unitPriceKopecks }
              : {}),
          })
          .where(eq(menuItems.id, existing.id))
          .returning();
        if (!updated) throw new Error("Failed to update menu item");

        if (priceChanged) {
          await recordAuditEvent(tx, {
            organizationId,
            actorStaffId: staffId,
            action: "menu_item.price_changed",
            entityType: "menu_item",
            entityId: existing.id,
            before: { unitPriceKopecks: existing.unitPriceKopecks },
            after: { unitPriceKopecks: updated.unitPriceKopecks },
          });
        }

        return updated;
      });

      return StaffMenuItemSchema.parse(toStaffMenuItem(row));
    },
  );
}
