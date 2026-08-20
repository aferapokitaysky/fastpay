import type { FastifyReply, FastifyRequest } from "fastify";
import type { StaffRole } from "@fastpay/contracts";
import { getSession, type SessionData } from "../utils/session.js";
import { ForbiddenError, UnauthorizedError } from "./errorHandler.js";

declare module "fastify" {
  interface FastifyRequest {
    staff?: SessionData;
  }
}

const AUTH_HEADER = "authorization";
const BEARER_PREFIX = "Bearer ";

export function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers[AUTH_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith(BEARER_PREFIX)) return null;
  const token = value.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Fastify preHandler: resolves `Authorization: Bearer <token>` against the
 * Redis session store and attaches `{ staffId, organizationId, venueId,
 * role }` to `request.staff`. Throws the standard 401 error envelope when
 * the header is missing, malformed, or the session doesn't exist/expired.
 * Every staff/owner route in this slice must run this before any RBAC or
 * tenant-scoping check — see requireRole below and the ownership-check
 * pattern in the route handlers (org id always comes from request.staff,
 * never from the URL/body).
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = getBearerToken(request);
  if (!token) {
    throw new UnauthorizedError("UNAUTHORIZED", "Missing bearer token");
  }

  const session = await getSession(token);
  if (!session) {
    throw new UnauthorizedError("UNAUTHORIZED", "Invalid or expired session");
  }

  request.staff = session;
}

/**
 * Fastify preHandler factory: restricts a route to the given roles. Must
 * run after requireAuth (relies on request.staff being set). Returns 403
 * FORBIDDEN — not 404 — because the caller IS a valid, authenticated staff
 * member of their own tenant; they're just missing the role. 404 is
 * reserved for cross-tenant access attempts (see routes/lib/scoping.ts).
 */
export function requireRole(...roles: StaffRole[]) {
  return async function roleGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.staff) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(request.staff.role)) {
      throw new ForbiddenError("FORBIDDEN", `Requires role: ${roles.join(" or ")}`);
    }
  };
}
