import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  PasswordLoginRequestSchema,
  PinLoginRequestSchema,
  StaffSessionResponseSchema,
  type StaffSessionResponse,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { staff } from "../db/schema.js";
import { UnauthorizedError, TooManyRequestsError } from "../middleware/errorHandler.js";
import { requireAuth, getBearerToken } from "../middleware/auth.js";
import { verifyPassword, verifyPin } from "../utils/password.js";
import { createSession, deleteSession, sessionExpiresAtISOString } from "../utils/session.js";
import { checkRateLimit, clearRateLimit, recordFailedAttempt } from "../utils/rateLimit.js";

/**
 * `staff.email` is unique per-organization, not globally (see
 * docs/PRODUCT_SPEC_MVP.md section 3 / schema comment on `staff`), so the
 * same email could in principle belong to owner/manager rows in two
 * different organizations. Password login therefore fetches every
 * candidate row for that email and verifies the password against each
 * until one matches, rather than assuming a single global row. This never
 * reveals which (if any) candidate existed — a wrong password on any/all
 * candidates returns the same generic 401 INVALID_CREDENTIALS.
 */
async function findStaffByEmailAndPassword(email: string, password: string) {
  const candidates = await db
    .select()
    .from(staff)
    .where(and(eq(staff.email, email), isNotNull(staff.passwordHash)));

  for (const candidate of candidates) {
    if (candidate.passwordHash && (await verifyPassword(candidate.passwordHash, password))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Multiple waiters can share a venue, each with their own PIN. Login only
 * supplies (venueId, pin) — no staff id — so the PIN alone must uniquely
 * identify the staff member. Uniqueness of the plaintext PIN per venue is
 * enforced at staff-creation time (see routes/staffEmployees.ts), so at
 * most one candidate here should ever verify successfully.
 */
async function findStaffByVenueAndPin(venueId: string, pin: string) {
  const candidates = await db
    .select()
    .from(staff)
    .where(and(eq(staff.venueId, venueId), isNotNull(staff.pinHash)));

  for (const candidate of candidates) {
    if (candidate.pinHash && (await verifyPin(candidate.pinHash, pin))) {
      return candidate;
    }
  }
  return null;
}

export async function staffAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/staff/session/password", async (request) => {
    const body = PasswordLoginRequestSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const ip = request.ip;

    const rate = await checkRateLimit("password", email, ip);
    if (rate.limited) {
      throw new TooManyRequestsError("RATE_LIMITED", "Too many failed login attempts");
    }

    const matched = await findStaffByEmailAndPassword(email, body.password);
    if (!matched) {
      await recordFailedAttempt("password", email, ip);
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid email or password");
    }

    await clearRateLimit("password", email, ip);

    const token = await createSession({
      staffId: matched.id,
      organizationId: matched.organizationId,
      venueId: matched.venueId,
      role: matched.role,
    });

    const payload: StaffSessionResponse = {
      token,
      expiresAt: sessionExpiresAtISOString(),
      staff: {
        id: matched.id,
        name: matched.name,
        role: matched.role,
        organizationId: matched.organizationId,
        venueId: matched.venueId,
      },
    };
    return StaffSessionResponseSchema.parse(payload);
  });

  app.post("/v1/staff/session/pin", async (request) => {
    const body = PinLoginRequestSchema.parse(request.body);
    const ip = request.ip;

    const rate = await checkRateLimit("pin", body.venueId, ip);
    if (rate.limited) {
      throw new TooManyRequestsError("RATE_LIMITED", "Too many failed login attempts");
    }

    const matched = await findStaffByVenueAndPin(body.venueId, body.pin);
    if (!matched) {
      await recordFailedAttempt("pin", body.venueId, ip);
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Invalid venue or PIN");
    }

    await clearRateLimit("pin", body.venueId, ip);

    const token = await createSession({
      staffId: matched.id,
      organizationId: matched.organizationId,
      venueId: matched.venueId,
      role: matched.role,
    });

    const payload: StaffSessionResponse = {
      token,
      expiresAt: sessionExpiresAtISOString(),
      staff: {
        id: matched.id,
        name: matched.name,
        role: matched.role,
        organizationId: matched.organizationId,
        venueId: matched.venueId,
      },
    };
    return StaffSessionResponseSchema.parse(payload);
  });

  app.post(
    "/v1/staff/session/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const token = getBearerToken(request);
      if (token) {
        await deleteSession(token);
      }
      reply.status(204);
      return null;
    },
  );
}
