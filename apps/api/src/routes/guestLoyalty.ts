import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  LoyaltyDeleteResponseSchema,
  LoyaltyOptInRequestSchema,
  LoyaltyOptOutRequestSchema,
  LoyaltyProfileResponseSchema,
  type LoyaltyProfileResponse,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { floors, guestProfiles, orders, paymentIntents, tables, venues } from "../db/schema.js";
import { NotFoundError, ConflictError } from "../middleware/errorHandler.js";
import { hashPhone } from "../utils/crypto.js";

/**
 * Guest loyalty opt-in/out — see packages/contracts/src/guestLoyalty.ts for
 * why both routes hang off a concrete paymentIntentId rather than a bare
 * phone number. No staff/session auth (docs/PRODUCT_SPEC_MVP.md section
 * 10's guest-facing surface never requires one) — the trust boundary is
 * "you know a payment intent id that actually succeeded", same class of
 * access as GET /v1/public/payment-intents/:id.
 */

async function resolveOrganizationId(orderId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: venues.organizationId })
    .from(orders)
    .innerJoin(tables, eq(tables.id, orders.tableId))
    .innerJoin(floors, eq(floors.id, tables.floorId))
    .innerJoin(venues, eq(venues.id, floors.venueId))
    .where(eq(orders.id, orderId))
    .limit(1);
  return row?.organizationId ?? null;
}

export async function guestLoyaltyRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/v1/public/payment-intents/:id/loyalty-optin",
    async (request, reply) => {
      const body = LoyaltyOptInRequestSchema.parse(request.body);

      const [intent] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, request.params.id))
        .limit(1);
      if (!intent) {
        throw new NotFoundError("PAYMENT_INTENT_NOT_FOUND", "No payment intent matches this id");
      }
      if (intent.status !== "succeeded") {
        throw new ConflictError(
          "PAYMENT_NOT_SUCCEEDED",
          "Loyalty opt-in is only available after payment has succeeded",
        );
      }

      const organizationId = await resolveOrganizationId(intent.orderId);
      if (!organizationId) {
        throw new Error(`Payment intent ${intent.id} has an order with no resolvable organization`);
      }

      const phoneHash = hashPhone(body.phone);
      const totalKopecks = intent.amountFoodKopecks + intent.amountTipKopecks;
      const now = new Date();

      const [row] = await db
        .insert(guestProfiles)
        .values({
          organizationId,
          phoneHash,
          visitCount: 1,
          totalSpentKopecks: totalKopecks,
          firstVisitAt: now,
          lastVisitAt: now,
        })
        .onConflictDoUpdate({
          target: [guestProfiles.organizationId, guestProfiles.phoneHash],
          set: {
            visitCount: sql`${guestProfiles.visitCount} + 1`,
            totalSpentKopecks: sql`${guestProfiles.totalSpentKopecks} + ${totalKopecks}`,
            lastVisitAt: now,
          },
        })
        .returning();
      if (!row) throw new Error("Failed to upsert guest profile");

      reply.status(200);
      const response: LoyaltyProfileResponse = {
        optedIn: true,
        visitCount: row.visitCount,
        totalSpentKopecks: row.totalSpentKopecks,
      };
      return LoyaltyProfileResponseSchema.parse(response);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/v1/public/payment-intents/:id/loyalty-optin",
    async (request) => {
      const body = LoyaltyOptOutRequestSchema.parse(request.body);

      const [intent] = await db
        .select({ orderId: paymentIntents.orderId })
        .from(paymentIntents)
        .where(eq(paymentIntents.id, request.params.id))
        .limit(1);
      if (!intent) {
        throw new NotFoundError("PAYMENT_INTENT_NOT_FOUND", "No payment intent matches this id");
      }

      const organizationId = await resolveOrganizationId(intent.orderId);
      if (!organizationId) {
        throw new Error(`Payment intent ${request.params.id} has an order with no resolvable organization`);
      }

      const phoneHash = hashPhone(body.phone);
      const deleted = await db
        .delete(guestProfiles)
        .where(and(eq(guestProfiles.organizationId, organizationId), eq(guestProfiles.phoneHash, phoneHash)))
        .returning({ id: guestProfiles.id });

      return LoyaltyDeleteResponseSchema.parse({ deleted: deleted.length > 0 });
    },
  );
}
