import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";
import { registerOwner, createEmployee, authHeader, uniqueEmail } from "./helpers.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

/**
 * "Never leak across tenants" (docs/PRODUCT_SPEC_MVP.md section 2): a token
 * from organization A must get a plain 404 — not 403 — when it tries to
 * touch organization B's resources, so it can't even confirm the resource
 * exists. One test per resource type that has an org-scoped lookup.
 */
describe("cross-tenant isolation (404, not 403)", () => {
  it("hides another organization's venue", async () => {
    const orgA = await registerOwner(app, { email: uniqueEmail("tenant-a-venue") });
    const orgB = await registerOwner(app, { email: uniqueEmail("tenant-b-venue") });

    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${orgB.venueId}`,
      headers: authHeader(orgA.token),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("VENUE_NOT_FOUND");
  });

  it("hides another organization's floor", async () => {
    const orgA = await registerOwner(app, { email: uniqueEmail("tenant-a-floor") });
    const orgB = await registerOwner(app, { email: uniqueEmail("tenant-b-floor") });

    const floorB = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${orgB.venueId}/floors`,
      headers: authHeader(orgB.token),
      payload: { name: "Main Hall" },
    });
    expect(floorB.statusCode).toBe(201);
    const floorBId = floorB.json().id as string;

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/staff/floors/${floorBId}`,
      headers: authHeader(orgA.token),
      payload: { name: "Hijacked" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("FLOOR_NOT_FOUND");
  });

  it("hides another organization's table", async () => {
    const orgA = await registerOwner(app, { email: uniqueEmail("tenant-a-table") });
    const orgB = await registerOwner(app, { email: uniqueEmail("tenant-b-table") });

    const floorB = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${orgB.venueId}/floors`,
      headers: authHeader(orgB.token),
      payload: { name: "Main Hall" },
    });
    const floorBId = floorB.json().id as string;
    const tableB = await app.inject({
      method: "POST",
      url: `/v1/staff/floors/${floorBId}/tables`,
      headers: authHeader(orgB.token),
      payload: { label: "01" },
    });
    const tableBId = tableB.json().id as string;

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableBId}/rotate-qr`,
      headers: authHeader(orgA.token),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("TABLE_NOT_FOUND");
  });

  it("hides another organization's menu item", async () => {
    const orgA = await registerOwner(app, { email: uniqueEmail("tenant-a-menu") });
    const orgB = await registerOwner(app, { email: uniqueEmail("tenant-b-menu") });

    const menuItemB = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${orgB.venueId}/menu-items`,
      headers: authHeader(orgB.token),
      payload: { name: "Секретна страва", unitPriceKopecks: 10000 },
    });
    const menuItemBId = menuItemB.json().id as string;

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/staff/menu-items/${menuItemBId}`,
      headers: authHeader(orgA.token),
      payload: { unitPriceKopecks: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("MENU_ITEM_NOT_FOUND");
  });

  it("hides another organization's order", async () => {
    const orgA = await registerOwner(app, { email: uniqueEmail("tenant-a-order") });
    const orgB = await registerOwner(app, { email: uniqueEmail("tenant-b-order") });

    const floorB = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${orgB.venueId}/floors`,
      headers: authHeader(orgB.token),
      payload: { name: "Main Hall" },
    });
    const floorBId = floorB.json().id as string;
    const tableB = await app.inject({
      method: "POST",
      url: `/v1/staff/floors/${floorBId}/tables`,
      headers: authHeader(orgB.token),
      payload: { label: "01" },
    });
    const tableBId = tableB.json().id as string;
    const orderB = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableBId}/orders`,
      headers: authHeader(orgB.token),
    });
    const orderBId = orderB.json().id as string;

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${orderBId}/request-bill`,
      headers: authHeader(orgA.token),
      payload: { version: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("RBAC", () => {
  it("returns 403 (not 404) when an authenticated waiter hits an owner/manager-only route", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("rbac-waiter") });
    const waiter = await createEmployee(app, owner.token, {
      name: "RBAC Waiter",
      role: "waiter",
      venueId: owner.venueId,
      pin: "1357",
    });

    const login = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId: owner.venueId, pin: "1357" },
    });
    const waiterToken = login.json().token as string;
    expect(login.json().staff.id).toBe(waiter.id);

    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/venues",
      headers: authHeader(waiterToken),
      payload: { name: "Should not be allowed" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when a manager/waiter from a different venue in the SAME org touches an order", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("rbac-cross-venue") });

    // Second venue in the same organization.
    const secondVenue = await app.inject({
      method: "POST",
      url: "/v1/staff/venues",
      headers: authHeader(owner.token),
      payload: { name: "Second Venue" },
    });
    const secondVenueId = secondVenue.json().id as string;

    const floor1 = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/floors`,
      headers: authHeader(owner.token),
      payload: { name: "Main Hall" },
    });
    const table1 = await app.inject({
      method: "POST",
      url: `/v1/staff/floors/${floor1.json().id}/tables`,
      headers: authHeader(owner.token),
      payload: { label: "01" },
    });
    const order1 = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${table1.json().id}/orders`,
      headers: authHeader(owner.token),
    });
    const order1Id = order1.json().id as string;

    // A waiter scoped to the SECOND venue.
    const waiter = await createEmployee(app, owner.token, {
      name: "Second Venue Waiter",
      role: "waiter",
      venueId: secondVenueId,
      pin: "2468",
    });
    const login = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId: secondVenueId, pin: "2468" },
    });
    expect(login.json().staff.id).toBe(waiter.id);
    const waiterToken = login.json().token as string;

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order1Id}/request-bill`,
      headers: authHeader(waiterToken),
      payload: { version: 1 },
    });

    // Same organization, so the order is findable (not a tenant leak) — but
    // this waiter isn't assigned to its venue, so it's a 403, not a 404.
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });
});
