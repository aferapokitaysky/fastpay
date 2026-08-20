import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { SetPaymentConfigRequestSchema, PaymentConfigResponseSchema, type PaymentConfigResponse } from "@fastpay/contracts";
import { db } from "../db/client.js";
import { venuePaymentConfigs } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgVenueOrThrow } from "../lib/scoping.js";
import { getProvider } from "../payments/registry.js";
import { BadRequestError, NotFoundError } from "../middleware/errorHandler.js";
import { encryptSecret } from "../utils/crypto.js";

function toResponse(row: {
  provider: string;
  configuredAt: Date;
  lastVerifiedAt: Date | null;
}): PaymentConfigResponse {
  return {
    provider: row.provider,
    configured: true,
    configuredAt: row.configuredAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
  };
}

/**
 * Owner/manager-only venue payment configuration. The decrypted credential
 * string is never returned in any response — see utils/crypto.ts. One
 * config per venue for now (unique venue_id), matching "один эквайер на
 * venue" being the MVP scope (docs/PRODUCT_SPEC_MVP.md doesn't describe
 * multi-provider-per-venue).
 */
export async function staffPaymentConfigRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/v1/staff/venues/:id/payment-config",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request, reply) => {
      const { organizationId } = request.staff!;
      const body = SetPaymentConfigRequestSchema.parse(request.body);
      const venue = await getOrgVenueOrThrow(request.params.id, organizationId);

      const provider = getProvider(body.provider);
      if (!provider) {
        throw new BadRequestError("UNKNOWN_PROVIDER", `No provider named "${body.provider}"`);
      }
      const check = await provider.checkConnection(body.credentials);
      if (!check.ok) {
        throw new BadRequestError("PROVIDER_CONNECTION_FAILED", check.message ?? "Provider rejected these credentials");
      }

      const encryptedCredentials = encryptSecret(body.credentials);
      const now = new Date();

      const [row] = await db
        .insert(venuePaymentConfigs)
        .values({
          venueId: venue.id,
          provider: body.provider,
          encryptedCredentials,
          lastVerifiedAt: now,
        })
        .onConflictDoUpdate({
          target: venuePaymentConfigs.venueId,
          set: { provider: body.provider, encryptedCredentials, lastVerifiedAt: now },
        })
        .returning();
      if (!row) throw new Error("Failed to save venue payment config");

      reply.status(200);
      return PaymentConfigResponseSchema.parse(toResponse(row));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/staff/venues/:id/payment-config",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const venue = await getOrgVenueOrThrow(request.params.id, organizationId);

      const [row] = await db
        .select()
        .from(venuePaymentConfigs)
        .where(eq(venuePaymentConfigs.venueId, venue.id))
        .limit(1);
      if (!row) {
        throw new NotFoundError("PAYMENT_CONFIG_NOT_FOUND", "This venue has no payment provider configured");
      }

      return PaymentConfigResponseSchema.parse(toResponse(row));
    },
  );
}
