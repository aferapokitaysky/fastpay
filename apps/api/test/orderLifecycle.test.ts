import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { db, pool } from "../src/db/client.js";
import { auditEvents } from "../src/db/schema.js";
import { redis } from "../src/redis/client.js";
import { registerOwner, authHeader, uniqueEmail } from "./helpers.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

interface Setup {
  ownerToken: string;
  venueId: string;
  tableId: string;
  qrToken: string;
  menuItemId: string;
  unitPriceKopecks: number;
}

async function setupVenueWithTableAndMenuItem(label: string): Promise<Setup> {
  const owner = await registerOwner(app, { email: uniqueEmail(label) });

  const floor = await app.inject({
    method: "POST",
    url: `/v1/staff/venues/${owner.venueId}/floors`,
    headers: authHeader(owner.token),
    payload: { name: "Main Hall" },
  });
  const floorId = floor.json().id as string;

  const table = await app.inject({
    method: "POST",
    url: `/v1/staff/floors/${floorId}/tables`,
    headers: authHeader(owner.token),
    payload: { label: "01" },
  });
  const tableId = table.json().id as string;
  const qrToken = table.json().qrToken as string;

  const menuItem = await app.inject({
    method: "POST",
    url: `/v1/staff/venues/${owner.venueId}/menu-items`,
    headers: authHeader(owner.token),
    payload: { name: "Бургер", unitPriceKopecks: 32000 },
  });

  return {
    ownerToken: owner.token,
    venueId: owner.venueId,
    tableId,
    qrToken,
    menuItemId: menuItem.json().id as string,
    unitPriceKopecks: 32000,
  };
}

describe("POST /v1/staff/tables/:id/orders", () => {
  it("opens a new order in status open with version 1", async () => {
    const { ownerToken, tableId } = await setupVenueWithTableAndMenuItem("order-open");

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("open");
    expect(body.version).toBe(1);
    expect(body.items).toEqual([]);
  });

  it("returns 409 TABLE_HAS_ACTIVE_ORDER for a second sequential attempt", async () => {
    const { ownerToken, tableId } = await setupVenueWithTableAndMenuItem("order-second-attempt");

    const first = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("TABLE_HAS_ACTIVE_ORDER");
  });

  it("under concurrent creation attempts on the same table, exactly one succeeds", async () => {
    const { ownerToken, tableId } = await setupVenueWithTableAndMenuItem("order-race");

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        app.inject({
          method: "POST",
          url: `/v1/staff/tables/${tableId}/orders`,
          headers: authHeader(ownerToken),
        }),
      ),
    );

    const succeeded = attempts.filter((r) => r.statusCode === 201);
    const conflicted = attempts.filter((r) => r.statusCode === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(7);
    for (const response of conflicted) {
      expect(response.json().error.code).toBe("TABLE_HAS_ACTIVE_ORDER");
    }
  });
});

describe("PATCH /v1/staff/orders/:id", () => {
  async function openOrder(ownerToken: string, tableId: string) {
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    return response.json() as { id: string; version: number };
  }

  it("adds an item, recomputes totals server-side, and bumps the version", async () => {
    const { ownerToken, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-patch-add",
    );
    const order = await openOrder(ownerToken, tableId);

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: {
        version: order.version,
        operations: [{ type: "add", menuItemId, quantity: 2 }],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe(order.version + 1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ quantity: 2, unitPriceKopecks: 32000, lineTotalKopecks: 64000 });
    expect(body.totalFoodKopecks).toBe(64000);
    expect(body.outstandingFoodKopecks).toBe(64000);
  });

  it("returns 409 ORDER_VERSION_CONFLICT with the current server state when the client's version is stale", async () => {
    const { ownerToken, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-version-conflict",
    );
    const order = await openOrder(ownerToken, tableId);

    // First mutation succeeds and bumps version to 2.
    const first = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: order.version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().version).toBe(2);

    // Second client still thinks version is 1 (stale).
    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: order.version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });

    expect(stale.statusCode).toBe(409);
    const body = stale.json();
    expect(body.error.code).toBe("ORDER_VERSION_CONFLICT");
    expect(body.error.details.currentOrder.version).toBe(2);
    expect(body.error.details.currentOrder.items).toHaveLength(1);
  });

  it("update and remove operations work and each still bump the version once per PATCH call", async () => {
    const { ownerToken, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-patch-update-remove",
    );
    const order = await openOrder(ownerToken, tableId);

    const added = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: order.version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });
    const itemId = added.json().items[0].id as string;
    expect(added.json().version).toBe(2);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: {
        version: 2,
        operations: [{ type: "update", orderItemId: itemId, quantity: 3, comment: "no onions" }],
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(3);
    expect(updated.json().items[0]).toMatchObject({ quantity: 3, comment: "no onions" });

    const removed = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: 3, operations: [{ type: "remove", orderItemId: itemId }] },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().version).toBe(4);
    expect(removed.json().items).toEqual([]);
  });

  it("rejects edits once the order is no longer in an editable status", async () => {
    const { ownerToken, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-not-editable",
    );
    const order = await openOrder(ownerToken, tableId);

    const closed = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(ownerToken),
      payload: { version: order.version },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().status).toBe("closed");

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: closed.json().version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ORDER_NOT_EDITABLE");
  });
});

describe("menu price changes do not retroactively affect existing order item snapshots", () => {
  it("keeps the order item's price at what it was when added, after the menu price changes", async () => {
    const { ownerToken, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-price-snapshot",
    );
    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    const order = opened.json() as { id: string; version: number };

    const withItem = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: order.version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });
    expect(withItem.json().items[0].unitPriceKopecks).toBe(32000);

    // Owner changes the menu price after the item was already added.
    const priceChange = await app.inject({
      method: "PATCH",
      url: `/v1/staff/menu-items/${menuItemId}`,
      headers: authHeader(ownerToken),
      payload: { unitPriceKopecks: 50000 },
    });
    expect(priceChange.statusCode).toBe(200);
    expect(priceChange.json().unitPriceKopecks).toBe(50000);

    // The EXISTING order item snapshot is unchanged.
    const orderAfterPriceChange = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: withItem.json().version, operations: [{ type: "update", orderItemId: withItem.json().items[0].id, comment: "still 320" }] },
    });
    expect(orderAfterPriceChange.json().items[0].unitPriceKopecks).toBe(32000);
    expect(orderAfterPriceChange.json().totalFoodKopecks).toBe(32000);

    // A NEW add on the same order (after the price change) snapshots the new price.
    const secondAdd = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: {
        version: orderAfterPriceChange.json().version,
        operations: [{ type: "add", menuItemId, quantity: 1 }],
      },
    });
    const newLine = secondAdd.json().items.find((item: { unitPriceKopecks: number }) => item.unitPriceKopecks === 50000);
    expect(newLine).toBeTruthy();

    // Price change was audited.
    const auditRows = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, "menu_item"), eq(auditEvents.entityId, menuItemId)));
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0]?.action).toBe("menu_item.price_changed");
  });
});

describe("POST /v1/staff/orders/:id/request-bill", () => {
  it("transitions open -> bill_requested", async () => {
    const { ownerToken, tableId } = await setupVenueWithTableAndMenuItem("order-request-bill");
    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    const order = opened.json() as { id: string; version: number };

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/request-bill`,
      headers: authHeader(ownerToken),
      payload: { version: order.version },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("bill_requested");
  });

  it("rejects requesting a bill on an already-closed order", async () => {
    const { ownerToken, tableId } = await setupVenueWithTableAndMenuItem("order-request-bill-closed");
    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    const order = opened.json() as { id: string; version: number };
    const closed = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(ownerToken),
      payload: { version: order.version },
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/request-bill`,
      headers: authHeader(ownerToken),
      payload: { version: closed.json().version },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INVALID_ORDER_TRANSITION");
  });
});

describe("POST /v1/staff/orders/:id/close", () => {
  it("a plain waiter can close an order with a zero balance", async () => {
    const { ownerToken, venueId, tableId } = await setupVenueWithTableAndMenuItem(
      "order-close-waiter-zero",
    );
    const waiterCreate = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(ownerToken),
      payload: { name: "Zero Balance Waiter", role: "waiter", venueId, pin: "1122" },
    });
    expect(waiterCreate.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId, pin: "1122" },
    });
    const waiterToken = login.json().token as string;

    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(waiterToken),
    });
    const order = opened.json() as { id: string; version: number };

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(waiterToken),
      payload: { version: order.version },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("closed");
  });

  it("blocks a plain waiter from closing an order with a nonzero balance", async () => {
    const { ownerToken, venueId, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-close-waiter-balance",
    );
    const waiterCreate = await app.inject({
      method: "POST",
      url: "/v1/staff/employees",
      headers: authHeader(ownerToken),
      payload: { name: "Balance Waiter", role: "waiter", venueId, pin: "3344" },
    });
    expect(waiterCreate.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId, pin: "3344" },
    });
    const waiterToken = login.json().token as string;

    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(waiterToken),
    });
    const order = opened.json() as { id: string; version: number };
    const withItem = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(waiterToken),
      payload: { version: order.version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(waiterToken),
      payload: { version: withItem.json().version },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("requires a reason from a manager/owner closing with a nonzero balance, and records an audit row", async () => {
    const { ownerToken, tableId, menuItemId } = await setupVenueWithTableAndMenuItem(
      "order-close-owner-balance",
    );
    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    const order = opened.json() as { id: string; version: number };
    const withItem = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(ownerToken),
      payload: { version: order.version, operations: [{ type: "add", menuItemId, quantity: 1 }] },
    });

    const withoutReason = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(ownerToken),
      payload: { version: withItem.json().version },
    });
    expect(withoutReason.statusCode).toBe(400);
    expect(withoutReason.json().error.code).toBe("CLOSE_REASON_REQUIRED");

    const withReason = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(ownerToken),
      payload: { version: withItem.json().version, reason: "Guest walked out, comped by manager" },
    });
    expect(withReason.statusCode).toBe(200);
    expect(withReason.json().status).toBe("closed");

    const auditRows = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, "order"), eq(auditEvents.entityId, order.id)));
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe("order.closed_with_balance");
    expect((auditRows[0]?.after as { reason?: string } | null)?.reason).toBe(
      "Guest walked out, comped by manager",
    );
  });

  it("rejects closing an already-closed order", async () => {
    const { ownerToken, tableId } = await setupVenueWithTableAndMenuItem("order-close-twice");
    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    const order = opened.json() as { id: string; version: number };
    const closed = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(ownerToken),
      payload: { version: order.version },
    });
    expect(closed.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/close`,
      headers: authHeader(ownerToken),
      payload: { version: closed.json().version },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ORDER_ALREADY_CLOSED");
  });
});

describe("GET /v1/public/tables/:token/bill reflects staff-triggered state", () => {
  it("shows bill_requested after staff calls request-bill", async () => {
    const { ownerToken, tableId, qrToken } = await setupVenueWithTableAndMenuItem(
      "order-public-reflects",
    );

    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableId}/orders`,
      headers: authHeader(ownerToken),
    });
    const order = opened.json() as { id: string; version: number };

    await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${order.id}/request-bill`,
      headers: authHeader(ownerToken),
      payload: { version: order.version },
    });

    const publicBill = await app.inject({ method: "GET", url: `/v1/public/tables/${qrToken}/bill` });
    expect(publicBill.statusCode).toBe(200);
    expect(publicBill.json().order.status).toBe("bill_requested");
  });
});
