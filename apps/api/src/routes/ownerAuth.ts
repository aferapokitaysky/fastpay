import type { FastifyInstance } from "fastify";
import {
  OwnerRegisterRequestSchema,
  OwnerRegisterResponseSchema,
  type OwnerRegisterResponse,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { organizations, staff, venues } from "../db/schema.js";
import { hashPassword } from "../utils/password.js";
import { createSession, sessionExpiresAtISOString } from "../utils/session.js";

/**
 * POST /v1/owner/register
 * Plain email+password registration — no OTP/email confirmation, per the
 * B0-deferred scope (docs/PRODUCT_SPEC_MVP.md section 12 item 1 is left
 * open; MVP trims it). Creates organization + first venue + an `owner`
 * staff row (venueId: null — owners span every venue in the org) in one
 * transaction, then issues a session exactly like the login endpoints.
 */
export async function ownerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/owner/register", async (request, reply) => {
    const body = OwnerRegisterRequestSchema.parse(request.body);

    const passwordHash = await hashPassword(body.password);

    const result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: body.organizationName })
        .returning({ id: organizations.id });
      if (!org) throw new Error("Failed to create organization");

      const [venue] = await tx
        .insert(venues)
        .values({ organizationId: org.id, name: body.venueName, logoUrl: null })
        .returning({ id: venues.id });
      if (!venue) throw new Error("Failed to create venue");

      const [owner] = await tx
        .insert(staff)
        .values({
          organizationId: org.id,
          venueId: null,
          name: body.organizationName,
          role: "owner",
          email: body.email,
          passwordHash,
        })
        .returning({ id: staff.id, name: staff.name, role: staff.role });
      if (!owner) throw new Error("Failed to create owner staff row");

      return { organizationId: org.id, venueId: venue.id, staffRow: owner };
    });

    const token = await createSession({
      staffId: result.staffRow.id,
      organizationId: result.organizationId,
      venueId: null,
      role: "owner",
    });

    const payload: OwnerRegisterResponse = {
      token,
      expiresAt: sessionExpiresAtISOString(),
      staff: {
        id: result.staffRow.id,
        name: result.staffRow.name,
        role: "owner",
        organizationId: result.organizationId,
        venueId: null,
      },
      organizationId: result.organizationId,
      venueId: result.venueId,
    };

    reply.status(201);
    return OwnerRegisterResponseSchema.parse(payload);
  });
}
