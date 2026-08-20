import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";
import { buildSignedFakeWebhookRequest } from "../src/payments/fakeProvider.js";
import { registerOwner, authHeader, uniqueIdempotencyKey, setupPayableOrder } from "./helpers.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

async function createIntent(
  qrToken: string,
  body: { itemIds: string[] | "all"; tipKopecks: number; idempotencyKey: string },
) {
  return app.inject({
    method: "POST",
    url: `/v1/public/tables/${qrToken}/payment-intents`,
    payload: body,
  });
}

async function sendFakeWebhook(secret: string, payload: Parameters<typeof buildSignedFakeWebhookRequest>[1]) {
  const { rawBody, headers } = buildSignedFakeWebhookRequest(secret, payload);
  return app.inject({
    method: "POST",
    url: "/v1/webhooks/fake",
    payload: rawBody,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("POST /v1/public/tables/:token/payment-intents", () => {
  it("reserves the item, creates a provider invoice, and returns provider_pending", async () => {
    const setup = await setupPayableOrder(app, "pi-create");

    const response = await createIntent(setup.qrToken, {
      itemIds: "all",
      tipKopecks: 3200,
      idempotencyKey: uniqueIdempotencyKey("pi-create"),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("provider_pending");
    expect(body.amountFoodKopecks).toBe(setup.unitPriceKopecks);
    expect(body.amountTipKopecks).toBe(3200);
    expect(body.totalKopecks).toBe(setup.unitPriceKopecks + 3200);
    expect(body.checkoutUrl).toContain("fake-provider.test");
  });

  it("returns 400 NO_ACTIVE_ORDER for a table with no open order", async () => {
    const owner = await registerOwner(app);
    const floor = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/floors`,
      headers: authHeader(owner.token),
      payload: { name: "Main Hall" },
    });
    const table = await app.inject({
      method: "POST",
      url: `/v1/staff/floors/${(floor.json() as { id: string }).id}/tables`,
      headers: authHeader(owner.token),
      payload: { label: "09" },
    });
    const qrToken = (table.json() as { qrToken: string }).qrToken;

    const response = await createIntent(qrToken, {
      itemIds: "all",
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("pi-no-order"),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("NO_ACTIVE_ORDER");
  });

  it("returns 404 for an unknown QR token", async () => {
    const response = await createIntent("does-not-exist", {
      itemIds: "all",
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("pi-unknown-token"),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("TABLE_NOT_FOUND");
  });

  it("idempotency-key retry returns the SAME intent (200), not a new one", async () => {
    const setup = await setupPayableOrder(app, "pi-idempotent");
    const key = uniqueIdempotencyKey("pi-idempotent");

    const first = await createIntent(setup.qrToken, { itemIds: "all", tipKopecks: 0, idempotencyKey: key });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().paymentIntentId;

    const second = await createIntent(setup.qrToken, { itemIds: "all", tipKopecks: 0, idempotencyKey: key });
    expect(second.statusCode).toBe(200);
    expect(second.json().paymentIntentId).toBe(firstId);
  });

  describe("concurrent reservation race", () => {
    it("under 8 concurrent requests for the same item, exactly one reserves it", async () => {
      const setup = await setupPayableOrder(app, "pi-race");

      const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
          createIntent(setup.qrToken, {
            itemIds: [setup.orderItemId],
            tipKopecks: 0,
            idempotencyKey: uniqueIdempotencyKey("pi-race"),
          }),
        ),
      );

      const succeeded = attempts.filter((r) => r.statusCode === 201);
      const conflicted = attempts.filter((r) => r.statusCode === 409);
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(7);
      for (const response of conflicted) {
        expect(response.json().error.code).toBe("ITEM_RESERVED_OR_PAID");
      }
    });

    it("itemIds: 'all' silently excludes an already-reserved item instead of erroring on it specifically", async () => {
      const setup = await setupPayableOrder(app, "pi-race-all");
      await createIntent(setup.qrToken, {
        itemIds: [setup.orderItemId],
        tipKopecks: 0,
        idempotencyKey: uniqueIdempotencyKey("pi-race-all-first"),
      });

      // Only one item exists on this order and it's now reserved — "all" resolves to nothing payable.
      const response = await createIntent(setup.qrToken, {
        itemIds: "all",
        tipKopecks: 0,
        idempotencyKey: uniqueIdempotencyKey("pi-race-all-second"),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("NO_PAYABLE_ITEMS");
    });
  });
});

describe("GET /v1/public/payment-intents/:id", () => {
  it("never reports succeeded before a webhook actually arrives", async () => {
    const setup = await setupPayableOrder(app, "pi-poll");
    const created = await createIntent(setup.qrToken, {
      itemIds: "all",
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("pi-poll"),
    });
    const intentId = created.json().paymentIntentId;

    const polled = await app.inject({ method: "GET", url: `/v1/public/payment-intents/${intentId}` });
    expect(polled.statusCode).toBe(200);
    expect(polled.json().status).toBe("provider_pending");
    expect(polled.json().status).not.toBe("succeeded");
  });

  it("returns 404 for an unknown intent id", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/public/payment-intents/${randomUUID()}` });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("PAYMENT_INTENT_NOT_FOUND");
  });
});

describe("POST /v1/webhooks/fake", () => {
  it("full happy path: intent -> signed webhook -> item paid -> order status paid -> bill reflects it", async () => {
    const setup = await setupPayableOrder(app, "wh-happy-path");
    const created = await createIntent(setup.qrToken, {
      itemIds: "all",
      tipKopecks: 1000,
      idempotencyKey: uniqueIdempotencyKey("wh-happy-path"),
    });
    const intent = created.json();

    const webhook = await sendFakeWebhook(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "succeeded",
      amountKopecks: intent.totalKopecks,
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json()).toMatchObject({ received: true, duplicate: false });

    const polled = await app.inject({ method: "GET", url: `/v1/public/payment-intents/${intent.paymentIntentId}` });
    expect(polled.json().status).toBe("succeeded");

    const bill = await app.inject({ method: "GET", url: `/v1/public/tables/${setup.qrToken}/bill` });
    const billBody = bill.json();
    expect(billBody.order.status).toBe("paid");
    expect(billBody.order.outstandingFoodKopecks).toBe(0);
    expect(billBody.order.items[0].paymentStatus).toBe("paid");
    expect(billBody.order.items[0].remainingKopecks).toBe(0);
  });

  it("a duplicate delivery of the same event id is a no-op, not a double allocation", async () => {
    const setup = await setupPayableOrder(app, "wh-duplicate");
    const created = await createIntent(setup.qrToken, {
      itemIds: "all",
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("wh-duplicate"),
    });
    const intent = created.json();
    const eventId = `evt-${randomUUID()}`;
    const payload = {
      providerEventId: eventId,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "succeeded" as const,
      amountKopecks: intent.totalKopecks,
    };

    const first = await sendFakeWebhook(setup.webhookSecret, payload);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ duplicate: false });

    const second = await sendFakeWebhook(setup.webhookSecret, payload);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ duplicate: true });

    const polled = await app.inject({ method: "GET", url: `/v1/public/payment-intents/${intent.paymentIntentId}` });
    expect(polled.json().status).toBe("succeeded");
  });

  it("an amount mismatch goes to review_required, never silently marks the order paid", async () => {
    const setup = await setupPayableOrder(app, "wh-amount-mismatch");
    const created = await createIntent(setup.qrToken, {
      itemIds: "all",
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("wh-amount-mismatch"),
    });
    const intent = created.json();

    const webhook = await sendFakeWebhook(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "succeeded",
      amountKopecks: intent.totalKopecks - 1, // one kopeck short
    });
    expect(webhook.statusCode).toBe(200); // provider still gets acked

    const polled = await app.inject({ method: "GET", url: `/v1/public/payment-intents/${intent.paymentIntentId}` });
    expect(polled.json().status).toBe("review_required");

    const bill = await app.inject({ method: "GET", url: `/v1/public/tables/${setup.qrToken}/bill` });
    expect(bill.json().order.outstandingFoodKopecks).toBeGreaterThan(0);
    expect(bill.json().order.items[0].paymentStatus).not.toBe("paid");
  });

  it("rejects a webhook with an invalid signature", async () => {
    const setup = await setupPayableOrder(app, "wh-bad-signature");
    const created = await createIntent(setup.qrToken, {
      itemIds: "all",
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("wh-bad-signature"),
    });
    const intent = created.json();

    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/fake",
      payload: JSON.stringify({
        providerEventId: `evt-${randomUUID()}`,
        providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
        status: "succeeded",
        amountKopecks: intent.totalKopecks,
      }),
      headers: { "content-type": "application/json", "x-fake-signature": "0".repeat(64) },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("a failed payment releases the reservation so the item is payable again immediately", async () => {
    const setup = await setupPayableOrder(app, "wh-failed-release");
    const created = await createIntent(setup.qrToken, {
      itemIds: [setup.orderItemId],
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("wh-failed-release"),
    });
    const intent = created.json();

    const webhook = await sendFakeWebhook(setup.webhookSecret, {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: `fake_inv_${intent.paymentIntentId}`,
      status: "failed",
      amountKopecks: intent.totalKopecks,
    });
    expect(webhook.statusCode).toBe(200);

    // A second guest can now reserve the same item without waiting out the TTL.
    const retry = await createIntent(setup.qrToken, {
      itemIds: [setup.orderItemId],
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("wh-failed-release-retry"),
    });
    expect(retry.statusCode).toBe(201);
  });

  it("returns 200 (not an error) for a webhook whose invoice id matches nothing we created", async () => {
    const response = await sendFakeWebhook("irrelevant-secret-since-lookup-fails-first", {
      providerEventId: `evt-${randomUUID()}`,
      providerInvoiceId: "fake_inv_does-not-exist",
      status: "succeeded",
      amountKopecks: 1,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ received: true, matched: false });
  });
});

describe("split-bill: paying a subset leaves the rest untouched and still payable", () => {
  it("reserves only the named item, leaving a sibling item payable by someone else", async () => {
    const owner = await registerOwner(app, { email: `split-${randomUUID()}@test.fastpay.ua`, password: "test-password-123" });
    const floor = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/floors`,
      headers: authHeader(owner.token),
      payload: { name: "Main Hall" },
    });
    const table = await app.inject({
      method: "POST",
      url: `/v1/staff/floors/${(floor.json() as { id: string }).id}/tables`,
      headers: authHeader(owner.token),
      payload: { label: "05" },
    });
    const tableBody = table.json() as { id: string; qrToken: string };

    const burger = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/menu-items`,
      headers: authHeader(owner.token),
      payload: { name: "Бургер", unitPriceKopecks: 32000 },
    });
    const fries = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/menu-items`,
      headers: authHeader(owner.token),
      payload: { name: "Картопля фрі", unitPriceKopecks: 14000 },
    });

    const opened = await app.inject({
      method: "POST",
      url: `/v1/staff/tables/${tableBody.id}/orders`,
      headers: authHeader(owner.token),
    });
    const order = opened.json() as { id: string; version: number };
    const withItems = await app.inject({
      method: "PATCH",
      url: `/v1/staff/orders/${order.id}`,
      headers: authHeader(owner.token),
      payload: {
        version: order.version,
        operations: [
          { type: "add", menuItemId: (burger.json() as { id: string }).id, quantity: 1 },
          { type: "add", menuItemId: (fries.json() as { id: string }).id, quantity: 1 },
        ],
      },
    });
    const items = (withItems.json() as { items: { id: string; name: string }[] }).items;
    const burgerItem = items.find((item) => item.name === "Бургер")!;
    const friesItem = items.find((item) => item.name === "Картопля фрі")!;

    const response = await createIntent(tableBody.qrToken, {
      itemIds: [burgerItem.id],
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("split-bill"),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().amountFoodKopecks).toBe(32000);

    // Fries is untouched — a second guest can still pay just that.
    const secondGuest = await createIntent(tableBody.qrToken, {
      itemIds: [friesItem.id],
      tipKopecks: 0,
      idempotencyKey: uniqueIdempotencyKey("split-bill-fries"),
    });
    expect(secondGuest.statusCode).toBe(201);
    expect(secondGuest.json().amountFoodKopecks).toBe(14000);
  });
});

describe("POST /v1/staff/venues/:id/payment-config", () => {
  it("never returns the decrypted credential in any response", async () => {
    const owner = await registerOwner(app, { email: `payconfig-${randomUUID()}@test.fastpay.ua`, password: "test-password-123" });

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/payment-config`,
      headers: authHeader(owner.token),
      payload: { provider: "fake", credentials: "super-secret-value-should-never-leak" },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain("super-secret-value-should-never-leak");

    const fetched = await app.inject({
      method: "GET",
      url: `/v1/staff/venues/${owner.venueId}/payment-config`,
      headers: authHeader(owner.token),
    });
    expect(JSON.stringify(fetched.json())).not.toContain("super-secret-value-should-never-leak");
  });

  it("rejects empty credentials (FakeProvider.checkConnection fails)", async () => {
    const owner = await registerOwner(app, { email: `payconfig-empty-${randomUUID()}@test.fastpay.ua`, password: "test-password-123" });

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${owner.venueId}/payment-config`,
      headers: authHeader(owner.token),
      payload: { provider: "fake", credentials: "   " },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("PROVIDER_CONNECTION_FAILED");
  });

  it("returns 404 for another organization's venue (tenant isolation, same as B1)", async () => {
    const orgA = await registerOwner(app, { email: `payconfig-tenant-a-${randomUUID()}@test.fastpay.ua`, password: "test-password-123" });
    const orgB = await registerOwner(app, { email: `payconfig-tenant-b-${randomUUID()}@test.fastpay.ua`, password: "test-password-123" });

    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/venues/${orgB.venueId}/payment-config`,
      headers: authHeader(orgA.token),
      payload: { provider: "fake", credentials: "some-secret" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("VENUE_NOT_FOUND");
  });
});
