import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { OwnerRegisterResponse, StaffEmployee } from "@fastpay/contracts";

/** Registers a brand-new organization + venue + owner and returns the full response (incl. bearer token). */
export async function registerOwner(
  app: FastifyInstance,
  overrides: Partial<{
    organizationName: string;
    venueName: string;
    email: string;
    password: string;
  }> = {},
): Promise<OwnerRegisterResponse> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/owner/register",
    payload: {
      organizationName: overrides.organizationName ?? `Org ${randomUUID()}`,
      venueName: overrides.venueName ?? "Main Venue",
      email: overrides.email ?? `owner-${randomUUID()}@test.fastpay.ua`,
      password: overrides.password ?? "test-password-123",
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`registerOwner failed: ${response.statusCode} ${response.body}`);
  }
  return response.json() as OwnerRegisterResponse;
}

/** Creates a manager or waiter under an existing venue, authenticated as the owner/manager passed in. */
export async function createEmployee(
  app: FastifyInstance,
  ownerToken: string,
  payload: {
    name: string;
    role: "manager" | "waiter";
    venueId: string;
    email?: string;
    password?: string;
    pin?: string;
  },
): Promise<StaffEmployee> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/staff/employees",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload,
  });
  if (response.statusCode !== 201) {
    throw new Error(`createEmployee failed: ${response.statusCode} ${response.body}`);
  }
  return response.json() as StaffEmployee;
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

/**
 * Tests run against a real, persistent Postgres/Redis (not a fresh
 * per-test-run database) — CI provisions ephemeral service containers per
 * job, but a local `npm test` reuses whatever is already running. Fixed
 * literal emails would collide with rows/rate-limit counters left over from
 * a previous local run (staff.email is unique per-organization, not
 * globally, so stale duplicates silently accumulate rather than erroring).
 * Suffix every test-owned email with a random fragment so each test run is
 * self-isolating, while keeping the readable label for debugging.
 */
export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@test.fastpay.ua`;
}
