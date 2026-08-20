import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  floors,
  orderItems,
  orders,
  paymentEvents,
  paymentIntentItems,
  paymentIntents,
  tables,
  venuePaymentConfigs,
  venues,
} from "../db/schema.js";
import { UnauthorizedError, NotFoundError, BadRequestError } from "../middleware/errorHandler.js";
import { isKnownProvider, getProvider } from "../payments/registry.js";
import { decryptSecret } from "../utils/crypto.js";
import { releaseReservation } from "../payments/reservation.js";
import { recomputeOrderPaymentStatus } from "../lib/orderState.js";

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const databaseError = error as { code?: unknown; cause?: unknown };
  // Drizzle 0.45 wraps node-postgres errors in DrizzleQueryError; preserve
  // webhook idempotency when the original PostgreSQL 23505 is its cause.
  return databaseError.code === "23505" || (
    typeof databaseError.cause === "object" &&
    databaseError.cause !== null &&
    (databaseError.cause as { code?: unknown }).code === "23505"
  );
}

/**
 * Resolves the venue that owns a given order, via
 * order -> table -> floor -> venue (same join chain as scoping.ts).
 */
async function getVenueIdForOrder(orderId: string): Promise<string | null> {
  const [row] = await db
    .select({ venueId: venues.id })
    .from(orders)
    .innerJoin(tables, eq(tables.id, orders.tableId))
    .innerJoin(floors, eq(floors.id, tables.floorId))
    .innerJoin(venues, eq(venues.id, floors.venueId))
    .where(eq(orders.id, orderId))
    .limit(1);
  return row?.venueId ?? null;
}

/**
 * Provider webhooks — no staff/session auth, the provider signs the request
 * instead (docs/PRODUCT_SPEC_MVP.md section 10). Registered in its own
 * encapsulated plugin scope so the custom raw-body content-type parser
 * below doesn't affect any other route's JSON parsing (Fastify scopes
 * addContentTypeParser to the encapsulation context it's registered in).
 *
 * Simplification documented here rather than hidden: B2 reuses the single
 * `venue_payment_configs.encrypted_credentials` value as both "the
 * acquirer API credential" and "the webhook signing secret". A real
 * acquirer typically issues these separately; PaymentProvider has no
 * second slot for it yet because only FakeProvider exists. Splitting this
 * is a small, additive change when a real provider adapter is built.
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body: Buffer, done) => {
      done(null, body);
    },
  );

  app.post<{ Params: { provider: string } }>("/v1/webhooks/:provider", async (request, reply) => {
    const providerName = request.params.provider;
    if (!isKnownProvider(providerName)) {
      throw new NotFoundError("UNKNOWN_PROVIDER", `No provider named "${providerName}"`);
    }
    const provider = getProvider(providerName)!;
    const rawBody = request.body as Buffer;

    let event: ReturnType<(typeof provider)["parseWebhookEvent"]>;
    try {
      event = provider.parseWebhookEvent(rawBody);
    } catch {
      throw new BadRequestError("MALFORMED_WEBHOOK", "Could not parse webhook payload");
    }

    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerInvoiceId, event.providerInvoiceId))
      .limit(1);
    if (!intent) {
      // Unknown invoice: never matched anything we created. Don't error —
      // that would make the provider retry forever on a request that can
      // never succeed. Just acknowledge receipt.
      reply.status(200);
      return { received: true, matched: false };
    }

    const venueId = await getVenueIdForOrder(intent.orderId);
    if (!venueId) {
      throw new Error(`Payment intent ${intent.id} has an order with no resolvable venue`);
    }
    const [paymentConfig] = await db
      .select()
      .from(venuePaymentConfigs)
      .where(eq(venuePaymentConfigs.venueId, venueId))
      .limit(1);
    if (!paymentConfig) {
      throw new UnauthorizedError(
        "PAYMENT_NOT_CONFIGURED",
        "This venue has no payment provider configured — cannot verify webhook signature",
      );
    }
    const secret = decryptSecret(paymentConfig.encryptedCredentials);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers[key] = value;
    }
    if (!provider.verifyWebhookSignature(rawBody, headers, secret)) {
      throw new UnauthorizedError("INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed");
    }

    // Idempotency: insert the event row FIRST, before any side effect. A
    // unique violation on provider_event_id means this exact delivery was
    // already processed — acknowledge without reprocessing (this is the
    // "webhook repeat" scenario the payment plan calls out explicitly).
    try {
      await db.insert(paymentEvents).values({
        paymentIntentId: intent.id,
        provider: providerName,
        providerEventId: event.providerEventId,
        rawPayload: JSON.parse(rawBody.toString("utf8")),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        reply.status(200);
        return { received: true, duplicate: true };
      }
      throw error;
    }

    if (event.status === "succeeded") {
      const expectedTotal = intent.amountFoodKopecks + intent.amountTipKopecks;
      if (event.amountKopecks !== expectedTotal) {
        // Amount mismatch is never silently accepted (product spec section
        // 7) — flag for manual review, leave items reserved/unpaid. The
        // reservation's own TTL still applies, so this doesn't block the
        // table forever even if nobody looks at it immediately.
        await db.update(paymentIntents).set({ status: "review_required" }).where(eq(paymentIntents.id, intent.id));
      } else {
        await db.transaction(async (tx) => {
          const coveredItems = await tx
            .select({ orderItemId: paymentIntentItems.orderItemId })
            .from(paymentIntentItems)
            .where(eq(paymentIntentItems.paymentIntentId, intent.id));
          const orderItemIds = coveredItems.map((row) => row.orderItemId);

          if (orderItemIds.length > 0) {
            await tx
              .update(orderItems)
              .set({ paymentStatus: "paid", reservedByPaymentIntentId: null, reservedUntil: null })
              .where(inArray(orderItems.id, orderItemIds));
          }

          await tx.update(paymentIntents).set({ status: "succeeded" }).where(eq(paymentIntents.id, intent.id));
          await recomputeOrderPaymentStatus(tx, intent.orderId);
        });
      }
    } else {
      // failed | expired | cancelled — release the reservation immediately
      // so the items become payable by someone else without waiting out
      // the TTL.
      await db.transaction(async (tx) => {
        await tx.update(paymentIntents).set({ status: event.status }).where(eq(paymentIntents.id, intent.id));
        await releaseReservation(tx, intent.id);
      });
    }

    await db
      .update(paymentEvents)
      .set({ processedAt: new Date() })
      .where(eq(paymentEvents.providerEventId, event.providerEventId));

    reply.status(200);
    return { received: true, duplicate: false };
  });
}
