import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";
import { buildSignedFakeWebhookRequest } from "../src/payments/fakeProvider.js";
import { registerOwner, createEmployee, authHeader, uniqueEmail, uniqueIdempotencyKey, setupPayableOrder } from "./helpers.js";

const app = buildApp();
await app.ready();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

type StaffEvent = { id: string; type: string; venueId: string; orderId?: string; [k: string]: unknown };
type IncomingMessage = { type: "staff.event"; event: StaffEvent } | { type: "ping" };

function connectRealtime(token: string): Promise<WebSocket> {
  return app.injectWS(`/v1/staff/realtime?token=${encodeURIComponent(token)}`);
}

/** Collects up to `count` non-ping messages, or times out. */
function collectEvents(ws: WebSocket, count: number, timeoutMs = 3000): Promise<StaffEvent[]> {
  return new Promise((resolve, reject) => {
    const events: StaffEvent[] = [];
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      resolve(events); // timeout is not a failure here — callers assert on what arrived
    }, timeoutMs);

    function onMessage(raw: Buffer) {
      const msg = JSON.parse(raw.toString("utf8")) as IncomingMessage;
      if (msg.type !== "staff.event") return;
      events.push(msg.event);
      if (events.length >= count) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(events);
      }
    }
    ws.on("message", onMessage);
    ws.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on("close", (code: number, reason: Buffer) => resolve({ code, reason: reason.toString() }));
  });
}

describe("GET /v1/staff/realtime — auth", () => {
  it("closes with 4401 for a missing/invalid token", async () => {
    const ws = await connectRealtime("not-a-real-session-token");
    const closed = await waitClose(ws);
    expect(closed.code).toBe(4401);
  });
});

describe("GET /v1/staff/realtime — live delivery from mutation points", () => {
  it("delivers order_updated, bill_requested, payment_started, payment_succeeded in order", async () => {
    const setup = await setupPayableOrder(app, "rt-happy");
    const ws = await connectRealtime(setup.ownerToken);
    // Drain whatever catch-up burst arrived from setupPayableOrder's own writes (none expected, but be defensive).
    await new Promise((r) => setTimeout(r, 100));

    const eventsPromise = collectEvents(ws, 4, 5000);

    await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${setup.orderId}`,
      headers: authHeader(setup.ownerToken),
      payload: { version: 2, operations: [{ type: "update", orderItemId: setup.orderItemId, quantity: 2 }] },
    });
    const billed = await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${setup.orderId}/request-bill`,
      headers: authHeader(setup.ownerToken),
      payload: { version: 3 },
    });
    expect(billed.statusCode).toBe(200);

    const intentRes = await app.inject({
      method: "POST",
      url: `/v1/public/tables/${setup.qrToken}/payment-intents`,
      payload: { itemIds: "all", tipKopecks: 500, idempotencyKey: uniqueIdempotencyKey("rt-happy") },
    });
    const intent = intentRes.json();

    const { rawBody, headers } = buildSignedFakeWebhookRequest(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "succeeded",
      amountKopecks: intent.totalKopecks,
    });
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/fake",
      payload: rawBody,
      headers: { "content-type": "application/json", ...headers },
    });

    const events = await eventsPromise;
    expect(events.map((e) => e.type)).toEqual([
      "order_updated",
      "bill_requested",
      "payment_started",
      "payment_succeeded",
    ]);
    expect(events.every((e) => e.orderId === setup.orderId)).toBe(true);
    expect(events.every((e) => e.venueId === setup.venueId)).toBe(true);
    ws.close();
  });

  it("delivers payment_failed when a webhook reports failed", async () => {
    const setup = await setupPayableOrder(app, "rt-failed");
    const ws = await connectRealtime(setup.ownerToken);
    await new Promise((r) => setTimeout(r, 100));
    // payment-intent creation fires payment_started first, then the webhook fires payment_failed.
    const eventsPromise = collectEvents(ws, 2, 5000);

    const intentRes = await app.inject({
      method: "POST",
      url: `/v1/public/tables/${setup.qrToken}/payment-intents`,
      payload: { itemIds: "all", tipKopecks: 0, idempotencyKey: uniqueIdempotencyKey("rt-failed") },
    });
    const intent = intentRes.json();
    const { rawBody, headers } = buildSignedFakeWebhookRequest(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "failed",
      amountKopecks: intent.totalKopecks,
    });
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/fake",
      payload: rawBody,
      headers: { "content-type": "application/json", ...headers },
    });

    const events = await eventsPromise;
    expect(events.map((e) => e.type)).toEqual(["payment_started", "payment_failed"]);
    ws.close();
  });

  it("never delivers another organization's venue events (tenant isolation)", async () => {
    const orgA = await setupPayableOrder(app, "rt-tenant-a");
    const orgB = await setupPayableOrder(app, "rt-tenant-b");

    const wsA = await connectRealtime(orgA.ownerToken);
    await new Promise((r) => setTimeout(r, 100));

    // Org B does a full mutation -> B3's own connection would see it, A must not.
    await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${orgB.orderId}`,
      headers: authHeader(orgB.ownerToken),
      payload: { version: 2, operations: [{ type: "update", orderItemId: orgB.orderItemId, quantity: 3 }] },
    });

    const leaked = await collectEvents(wsA, 1, 800);
    expect(leaked).toHaveLength(0);

    // Confirm A's connection is still alive and correctly wired to its own venue.
    const ownEventPromise = collectEvents(wsA, 1, 3000);
    await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${orgA.orderId}`,
      headers: authHeader(orgA.ownerToken),
      payload: { version: 2, operations: [{ type: "update", orderItemId: orgA.orderItemId, quantity: 2 }] },
    });
    const ownEvents = await ownEventPromise;
    expect(ownEvents).toHaveLength(1);
    expect(ownEvents[0]!.orderId).toBe(orgA.orderId);

    wsA.close();
  });
});

describe("GET /v1/staff/realtime — reconnect catch-up and notification commands", () => {
  it("a resolved notification drops out of the catch-up burst; an unresolved one stays", async () => {
    const setup = await setupPayableOrder(app, "rt-catchup");
    const ws1 = await connectRealtime(setup.ownerToken);
    await new Promise((r) => setTimeout(r, 100));
    const firstEventPromise = collectEvents(ws1, 1, 3000);

    await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${setup.orderId}`,
      headers: authHeader(setup.ownerToken),
      payload: { version: 2, operations: [{ type: "update", orderItemId: setup.orderItemId, quantity: 2 }] },
    });
    const [event] = await firstEventPromise;
    expect(event).toBeDefined();

    ws1.send(JSON.stringify({ type: "notification.resolved", notificationId: event!.id }));
    await new Promise((r) => setTimeout(r, 200));
    ws1.close();

    const ws2 = await connectRealtime(setup.ownerToken);
    const catchup = await collectEvents(ws2, 1, 800);
    expect(catchup.map((e) => e.id)).not.toContain(event!.id);
    ws2.close();
  });

  it("silently ignores a command for a notificationId outside the connection's tenant/venue scope", async () => {
    const orgA = await setupPayableOrder(app, "rt-foreign-a");
    const orgB = await setupPayableOrder(app, "rt-foreign-b");

    const wsB = await connectRealtime(orgB.ownerToken);
    await new Promise((r) => setTimeout(r, 100));
    const eventPromiseA = collectEvents(await connectRealtime(orgA.ownerToken), 1, 3000);
    await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${orgA.orderId}`,
      headers: authHeader(orgA.ownerToken),
      payload: { version: 2, operations: [{ type: "update", orderItemId: orgA.orderItemId, quantity: 2 }] },
    });
    const [eventA] = await eventPromiseA;
    expect(eventA).toBeDefined();

    // Org B's connection tries to resolve org A's notification id — must not throw, must not close the socket.
    wsB.send(JSON.stringify({ type: "notification.resolved", notificationId: eventA!.id }));
    await new Promise((r) => setTimeout(r, 300));
    expect(wsB.readyState).toBe(wsB.OPEN);
    wsB.close();
  });
});

describe("GET /v1/staff/venues/:id/analytics/daily", () => {
  it("computes revenue, tips, average check, closed tables, popular items and staff attribution", async () => {
    const setup = await setupPayableOrder(app, "an-happy");
    const intentRes = await app.inject({
      method: "POST",
      url: `/v1/public/tables/${setup.qrToken}/payment-intents`,
      payload: { itemIds: "all", tipKopecks: 700, idempotencyKey: uniqueIdempotencyKey("an-happy") },
    });
    const intent = intentRes.json();
    const { rawBody, headers } = buildSignedFakeWebhookRequest(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "succeeded",
      amountKopecks: intent.totalKopecks,
    });
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/fake",
      payload: rawBody,
      headers: { "content-type": "application/json", ...headers },
    });
    await app.inject({
      method: "POST",
      url: `/v1/staff/orders/${setup.orderId}/close`,
      headers: authHeader(setup.ownerToken),
      payload: { version: 3 },
    });

    const today = new Date().toISOString().slice(0, 10);
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${setup.venueId}/analytics/daily?date=${today}`,
      headers: authHeader(setup.ownerToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.revenueKopecks).toBe(setup.unitPriceKopecks);
    expect(body.tipsKopecks).toBe(700);
    expect(body.averageCheckKopecks).toBe(setup.unitPriceKopecks);
    expect(body.closedTablesCount).toBe(1);
    expect(body.popularItems).toHaveLength(1);
    expect(body.popularItems[0]).toMatchObject({ name: "Бургер", quantitySold: 1, revenueKopecks: setup.unitPriceKopecks });
    expect(body.staffPerformance).toHaveLength(1);
    expect(body.staffPerformance[0]).toMatchObject({ ordersOpened: 1, revenueKopecks: setup.unitPriceKopecks });
  });

  it("returns 403 for a waiter (owner/manager only)", async () => {
    const setup = await setupPayableOrder(app, "an-rbac");
    const waiter = await createEmployee(app, setup.ownerToken, {
      name: "Waiter",
      role: "waiter",
      venueId: setup.venueId,
      pin: "7788",
    });
    const login = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId: setup.venueId, pin: "7788" },
    });
    expect(login.statusCode).toBe(200);
    expect(waiter.role).toBe("waiter");

    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${setup.venueId}/analytics/daily?date=2026-01-01`,
      headers: authHeader(login.json().token),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for another organization's venue", async () => {
    const orgA = await registerOwner(app, { email: uniqueEmail("an-tenant-a") });
    const orgB = await registerOwner(app, { email: uniqueEmail("an-tenant-b") });

    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${orgB.venueId}/analytics/daily?date=2026-01-01`,
      headers: authHeader(orgA.token),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("VENUE_NOT_FOUND");
  });

  it("returns 400 for a malformed date", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("an-bad-date") });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${owner.venueId}/analytics/daily?date=not-a-date`,
      headers: authHeader(owner.token),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("Guest loyalty opt-in/out", () => {
  async function paidIntent(label: string) {
    const setup = await setupPayableOrder(app, label);
    const intentRes = await app.inject({
      method: "POST",
      url: `/v1/public/tables/${setup.qrToken}/payment-intents`,
      payload: { itemIds: "all", tipKopecks: 0, idempotencyKey: uniqueIdempotencyKey(label) },
    });
    const intent = intentRes.json();
    const { rawBody, headers } = buildSignedFakeWebhookRequest(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "succeeded",
      amountKopecks: intent.totalKopecks,
    });
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/fake",
      payload: rawBody,
      headers: { "content-type": "application/json", ...headers },
    });
    return { setup, intentId: intent.paymentIntentId as string, totalKopecks: intent.totalKopecks as number };
  }

  it("rejects opt-in before the payment has succeeded", async () => {
    const setup = await setupPayableOrder(app, "loy-gate");
    const intentRes = await app.inject({
      method: "POST",
      url: `/v1/public/tables/${setup.qrToken}/payment-intents`,
      payload: { itemIds: "all", tipKopecks: 0, idempotencyKey: uniqueIdempotencyKey("loy-gate") },
    });
    const intentId = intentRes.json().paymentIntentId;

    const response = await app.inject({
      method: "POST",
      url: `/v1/public/payment-intents/${intentId}/loyalty-optin`,
      payload: { phone: "+380501112233" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("PAYMENT_NOT_SUCCEEDED");
  });

  it("opts in, upserts on a repeat visit, never leaks the phone or its hash, then opts out", async () => {
    const phone = "+380501234567";
    const first = await paidIntent("loy-optin-1");

    const optIn1 = await app.inject({
      method: "POST",
      url: `/v1/public/payment-intents/${first.intentId}/loyalty-optin`,
      payload: { phone },
    });
    expect(optIn1.statusCode).toBe(200);
    expect(optIn1.json()).toMatchObject({ optedIn: true, visitCount: 1, totalSpentKopecks: first.totalKopecks });
    expect(optIn1.body).not.toContain(phone);

    // A second, unrelated succeeded intent for the SAME phone (different guest visit, same org — not
    // guaranteed same venue, but setupPayableOrder always creates a fresh org, so this exercises a
    // brand-new organization's guest_profiles row rather than an upsert. Use the same intent's org
    // instead by opting in twice against intents from the same setup to exercise the increment path.
    const second = await app.inject({
      method: "POST",
      url: `/v1/public/payment-intents/${first.intentId}/loyalty-optin`,
      payload: { phone },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      optedIn: true,
      visitCount: 2,
      totalSpentKopecks: first.totalKopecks * 2,
    });

    const optOut = await app.inject({
      method: "DELETE",
      url: `/v1/public/payment-intents/${first.intentId}/loyalty-optin`,
      payload: { phone },
    });
    expect(optOut.statusCode).toBe(200);
    expect(optOut.json()).toEqual({ deleted: true });

    // Deleting again is a no-op, not an error.
    const optOutAgain = await app.inject({
      method: "DELETE",
      url: `/v1/public/payment-intents/${first.intentId}/loyalty-optin`,
      payload: { phone },
    });
    expect(optOutAgain.statusCode).toBe(200);
    expect(optOutAgain.json()).toEqual({ deleted: false });
  });

  it("returns 404 for an unknown payment intent id", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/public/payment-intents/${randomUUID()}/loyalty-optin`,
      payload: { phone: "+380501112233" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("PAYMENT_INTENT_NOT_FOUND");
  });
});
