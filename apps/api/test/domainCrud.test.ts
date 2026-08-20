import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";
import { registerOwner, authHeader, uniqueEmail } from "./helpers.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

async function createFloor(token: string, venueId: string, name = "Main Hall") {
  const response = await app.inject({
    method: "POST",
    url: `/v1/staff/venues/${venueId}/floors`,
    headers: authHeader(token),
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; venueId: string; name: string };
}

async function createTable(token: string, floorId: string, label = "01") {
  const response = await app.inject({
    method: "POST",
    url: `/v1/staff/floors/${floorId}/tables`,
    headers: authHeader(token),
    payload: { label },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; qrToken: string; label: string };
}

describe("venues", () => {
  it("creates, lists, gets, and updates a venue", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-venues") });

    const created = await app.inject({
      method: "POST",
      url: "/v1/staff/venues",
      headers: authHeader(owner.token),
      payload: { name: "Second Location" },
    });
    expect(created.statusCode).toBe(201);
    const venueId = created.json().id as string;

    const list = await app.inject({
      method: "GET",
      url: "/v1/staff/venues",
      headers: authHeader(owner.token),
    });
    expect(list.json().venues.map((v: { id: string }) => v.id)).toContain(venueId);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/staff/venues/${venueId}`,
      headers: authHeader(owner.token),
      payload: { name: "Renamed Location" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Renamed Location");
  });
});

describe("floors and tables", () => {
  it("creates a floor and a table under it, and lists both", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-floors-tables") });
    const floor = await createFloor(owner.token, owner.venueId);
    const table = await createTable(owner.token, floor.id, "07");

    expect(table.label).toBe("07");
    expect(table.qrToken).toBeTruthy();

    const floorsList = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${owner.venueId}/floors`,
      headers: authHeader(owner.token),
    });
    expect(floorsList.json().floors.map((f: { id: string }) => f.id)).toContain(floor.id);

    const tablesList = await app.inject({
      method: "GET",
      url: `/v1/staff/floors/${floor.id}/tables`,
      headers: authHeader(owner.token),
    });
    expect(tablesList.json().tables.map((t: { id: string }) => t.id)).toContain(table.id);
  });

  it("rotate-qr issues a new token and immediately invalidates the old one", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-rotate-qr") });
    const floor = await createFloor(owner.token, owner.venueId);
    const table = await createTable(owner.token, floor.id);
    const oldToken = table.qrToken;

    // Old token resolves via the public endpoint before rotation.
    const beforeRotate = await app.inject({
      method: "GET",
      url: `/v1/public/tables/${oldToken}/bill`,
    });
    expect(beforeRotate.statusCode).toBe(200);

    const rotated = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${table.id}/rotate-qr`,
      headers: authHeader(owner.token),
    });
    expect(rotated.statusCode).toBe(200);
    const newToken = rotated.json().qrToken as string;
    expect(newToken).not.toBe(oldToken);

    // Old token 404s immediately.
    const afterRotateOldToken = await app.inject({
      method: "GET",
      url: `/v1/public/tables/${oldToken}/bill`,
    });
    expect(afterRotateOldToken.statusCode).toBe(404);

    // New token works.
    const afterRotateNewToken = await app.inject({
      method: "GET",
      url: `/v1/public/tables/${newToken}/bill`,
    });
    expect(afterRotateNewToken.statusCode).toBe(200);
  });
});

describe("menu items", () => {
  it("creates, lists, and updates a menu item", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-menu-items") });

    const created = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/menu-items`,
      headers: authHeader(owner.token),
      payload: { name: "Борщ", unitPriceKopecks: 15000 },
    });
    expect(created.statusCode).toBe(201);
    const menuItemId = created.json().id as string;

    const list = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${owner.venueId}/menu-items`,
      headers: authHeader(owner.token),
    });
    expect(list.json().menuItems.map((m: { id: string }) => m.id)).toContain(menuItemId);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/staff/menu-items/${menuItemId}`,
      headers: authHeader(owner.token),
      payload: { unitPriceKopecks: 16500 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().unitPriceKopecks).toBe(16500);
  });
});

describe("employees", () => {
  it("creates a manager (email+password) and a waiter (pin), both scoped to the venue", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-employees") });

    const manager = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
      payload: {
        name: "Manager One",
        role: "manager",
        venueId: owner.venueId,
        email: uniqueEmail("manager-one"),
        password: "manager-password-123",
      },
    });
    expect(manager.statusCode).toBe(201);
    expect(manager.json().hasPin).toBe(false);

    const waiter = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
      payload: { name: "Waiter One", role: "waiter", venueId: owner.venueId, pin: "5678" },
    });
    expect(waiter.statusCode).toBe(201);
    expect(waiter.json().hasPin).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
    });
    const ids = list.json().employees.map((e: { id: string }) => e.id);
    expect(ids).toContain(manager.json().id);
    expect(ids).toContain(waiter.json().id);
    // The owner itself is also a staff row in the same organization.
    expect(ids).toContain(owner.staff.id);
  });

  it("rejects creating a manager without a password, and a waiter without a pin", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-employees-invalid") });

    const managerNoPassword = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
      payload: { name: "No Password", role: "manager", venueId: owner.venueId, email: uniqueEmail("x") },
    });
    expect(managerNoPassword.statusCode).toBe(400);

    const waiterNoPin = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
      payload: { name: "No Pin", role: "waiter", venueId: owner.venueId },
    });
    expect(waiterNoPin.statusCode).toBe(400);
  });

  it("rejects a duplicate PIN at the same venue", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-employees-dup-pin") });

    const first = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
      payload: { name: "First Waiter", role: "waiter", venueId: owner.venueId, pin: "1111" },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(owner.token),
      payload: { name: "Second Waiter", role: "waiter", venueId: owner.venueId, pin: "1111" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("PIN_ALREADY_IN_USE");
  });

  it("refuses to modify an owner row via the employees endpoint", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("crud-employees-owner-guard") });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/staff/employees/${owner.staff.id}`,
      headers: authHeader(owner.token),
      payload: { name: "Hacked Owner" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CANNOT_MODIFY_OWNER");
  });
});
