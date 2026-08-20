import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { floors, menuItems, orders, tables, venues } from "../db/schema.js";
import { ForbiddenError, NotFoundError } from "../middleware/errorHandler.js";
import type { SessionData } from "../utils/session.js";

/**
 * Tenant-scoped lookups shared by every staff/owner route. Each function
 * resolves a resource by id AND joins back to organization_id, so a token
 * from organization A can never observe whether a given id exists under
 * organization B — it gets a plain 404, matching the standard error
 * envelope, exactly like an unknown id would. This is the "never leak
 * across tenants" requirement from docs/PRODUCT_SPEC_MVP.md section 2.
 *
 * Cross-VENUE access within the SAME organization (e.g. a waiter assigned
 * to venue X hitting an order that belongs to venue Y) is a different
 * concern — that's a same-tenant authorization gap, not a tenant leak, so
 * assertVenueAccess below throws 403 FORBIDDEN instead of 404.
 */

export async function getOrgVenueOrThrow(venueId: string, organizationId: string) {
  const [venue] = await db
    .select()
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.organizationId, organizationId)))
    .limit(1);

  if (!venue) {
    throw new NotFoundError("VENUE_NOT_FOUND", "No venue matches this id");
  }
  return venue;
}

export async function getOrgFloorOrThrow(floorId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: floors.id,
      venueId: floors.venueId,
      name: floors.name,
      createdAt: floors.createdAt,
      updatedAt: floors.updatedAt,
    })
    .from(floors)
    .innerJoin(venues, eq(venues.id, floors.venueId))
    .where(and(eq(floors.id, floorId), eq(venues.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("FLOOR_NOT_FOUND", "No floor matches this id");
  }
  return row;
}

export async function getOrgTableOrThrow(tableId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: tables.id,
      floorId: tables.floorId,
      label: tables.label,
      qrToken: tables.qrToken,
      createdAt: tables.createdAt,
      updatedAt: tables.updatedAt,
      venueId: venues.id,
    })
    .from(tables)
    .innerJoin(floors, eq(floors.id, tables.floorId))
    .innerJoin(venues, eq(venues.id, floors.venueId))
    .where(and(eq(tables.id, tableId), eq(venues.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("TABLE_NOT_FOUND", "No table matches this id");
  }
  return row;
}

export async function getOrgMenuItemOrThrow(menuItemId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: menuItems.id,
      venueId: menuItems.venueId,
      name: menuItems.name,
      unitPriceKopecks: menuItems.unitPriceKopecks,
      createdAt: menuItems.createdAt,
      updatedAt: menuItems.updatedAt,
    })
    .from(menuItems)
    .innerJoin(venues, eq(venues.id, menuItems.venueId))
    .where(and(eq(menuItems.id, menuItemId), eq(venues.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("MENU_ITEM_NOT_FOUND", "No menu item matches this id");
  }
  return row;
}

/** Resolves an order plus its table's venueId, scoped to organizationId. */
export async function getOrgOrderOrThrow(orderId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: orders.id,
      tableId: orders.tableId,
      status: orders.status,
      version: orders.version,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      venueId: venues.id,
    })
    .from(orders)
    .innerJoin(tables, eq(tables.id, orders.tableId))
    .innerJoin(floors, eq(floors.id, tables.floorId))
    .innerJoin(venues, eq(venues.id, floors.venueId))
    .where(and(eq(orders.id, orderId), eq(venues.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("ORDER_NOT_FOUND", "No order matches this id");
  }
  return row;
}

/**
 * Order/table mutations are scoped to "their venue" (see B1 task spec).
 * Owners have `venueId: null` on their session (they span every venue in
 * the org), so they're always allowed. Managers/waiters are restricted to
 * the single venue on their staff row.
 */
export function assertVenueAccess(staff: SessionData, venueId: string): void {
  if (staff.venueId === null) return;
  if (staff.venueId !== venueId) {
    throw new ForbiddenError("FORBIDDEN", "Not assigned to this venue");
  }
}
