import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  CreatePaymentIntentRequestSchema,
  PaymentIntentResponseSchema,
  type PaymentIntentResponse,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { orders, paymentIntentItems, paymentIntents, tables } from "../db/schema.js";
import { NotFoundError, BadRequestError } from "../middleware/errorHandler.js";
import { listPayableOrderItemIds, reserveOrderItems, RESERVATION_TTL_MS } from "../payments/reservation.js";
import { getProvider } from "../payments/registry.js";

// Single-currency MVP, matches routes/publicBill.ts.
const CURRENCY = "UAH";
// Only provider wired up in B2 — see payments/provider.ts for why a real
// acquirer isn't hard-wired yet. Selecting a venue's configured provider
// (venue_payment_configs.provider) is a B2.5/B3 concern, not needed while
// only one provider exists.
const PROVIDER_NAME = "fake";

function toResponse(row: typeof paymentIntents.$inferSelect): PaymentIntentResponse {
  return {
    paymentIntentId: row.id,
    status: row.status,
    checkoutUrl: row.checkoutUrl,
    amountFoodKopecks: row.amountFoodKopecks,
    amountTipKopecks: row.amountTipKopecks,
    totalKopecks: row.amountFoodKopecks + row.amountTipKopecks,
    currency: row.currency,
    expiresAt: new Date(row.createdAt.getTime() + RESERVATION_TTL_MS).toISOString(),
  };
}

export async function publicPaymentIntentsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { token: string } }>(
    "/v1/public/tables/:token/payment-intents",
    async (request, reply) => {
      const body = CreatePaymentIntentRequestSchema.parse(request.body);

      const [table] = await db
        .select({ id: tables.id })
        .from(tables)
        .where(eq(tables.qrToken, request.params.token))
        .limit(1);
      if (!table) {
        throw new NotFoundError("TABLE_NOT_FOUND", "No table matches this QR token");
      }

      const [activeOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.tableId, table.id), ne(orders.status, "closed")))
        .orderBy(desc(orders.createdAt))
        .limit(1);
      if (!activeOrder) {
        throw new BadRequestError("NO_ACTIVE_ORDER", "This table has no active order to pay");
      }

      // Idempotent retry: the same client-supplied key returns the existing
      // intent (200) instead of creating a second one — a double-tap
      // "Оплатити" must never reserve/charge twice.
      const [existing] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.idempotencyKey, body.idempotencyKey))
        .limit(1);
      if (existing) {
        if (existing.orderId !== activeOrder.id) {
          throw new BadRequestError(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different order",
          );
        }
        reply.status(200);
        return PaymentIntentResponseSchema.parse(toResponse(existing));
      }

      const targetItemIds =
        body.itemIds === "all" ? await listPayableOrderItemIds(activeOrder.id) : body.itemIds;
      if (targetItemIds.length === 0) {
        throw new BadRequestError("NO_PAYABLE_ITEMS", "No order items to reserve");
      }

      const paymentIntentId = randomUUID();

      const { amountFoodKopecks } = await db.transaction(async (tx) => {
        // Inserted with a placeholder amount first: order_items.reserved_by_payment_intent_id
        // is a foreign key into this table, so the row must exist before
        // reserveOrderItems can point reservations at it. If reservation
        // fails below, the whole transaction (including this insert) rolls
        // back — no orphaned intent row is ever left behind.
        await tx.insert(paymentIntents).values({
          id: paymentIntentId,
          orderId: activeOrder.id,
          status: "created",
          idempotencyKey: body.idempotencyKey,
          amountFoodKopecks: 0,
          amountTipKopecks: body.tipKopecks,
          currency: CURRENCY,
          provider: PROVIDER_NAME,
        });

        const reserved = await reserveOrderItems(tx, paymentIntentId, activeOrder.id, targetItemIds);
        const amountFoodKopecks = reserved.reduce((sum, item) => sum + item.amountKopecks, 0);

        await tx
          .update(paymentIntents)
          .set({ amountFoodKopecks })
          .where(eq(paymentIntents.id, paymentIntentId));

        await tx.insert(paymentIntentItems).values(
          reserved.map((item) => ({
            paymentIntentId,
            orderItemId: item.orderItemId,
            amountKopecks: item.amountKopecks,
          })),
        );

        return { amountFoodKopecks };
      });

      // Provider call happens outside the DB transaction — never hold a
      // transaction open across a network call.
      const provider = getProvider(PROVIDER_NAME);
      if (!provider) {
        throw new Error(`Unknown payment provider: ${PROVIDER_NAME}`);
      }
      const totalKopecks = amountFoodKopecks + body.tipKopecks;
      const invoice = await provider.createInvoice({
        paymentIntentId,
        amountKopecks: totalKopecks,
        currency: CURRENCY,
        idempotencyKey: body.idempotencyKey,
      });

      const [updated] = await db
        .update(paymentIntents)
        .set({
          status: "provider_pending",
          providerInvoiceId: invoice.providerInvoiceId,
          checkoutUrl: invoice.checkoutUrl,
        })
        .where(eq(paymentIntents.id, paymentIntentId))
        .returning();
      if (!updated) throw new Error("Failed to update payment intent after invoice creation");

      reply.status(201);
      return PaymentIntentResponseSchema.parse(toResponse(updated));
    },
  );

  app.get<{ Params: { id: string } }>("/v1/public/payment-intents/:id", async (request) => {
    const [row] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, request.params.id))
      .limit(1);
    if (!row) {
      throw new NotFoundError("PAYMENT_INTENT_NOT_FOUND", "No payment intent matches this id");
    }
    return PaymentIntentResponseSchema.parse(toResponse(row));
  });
}
