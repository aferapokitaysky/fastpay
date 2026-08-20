import { z } from "zod";

/**
 * Staff roles per docs/PRODUCT_SPEC_MVP.md section 2:
 *   owner   — full org access, spans every venue (venueId is null on the
 *             staff row).
 *   manager — full access within their assigned venue.
 *   waiter  — PIN login, scoped to their assigned venue, order operations.
 */
export const StaffRoleSchema = z.enum(["owner", "manager", "waiter"]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const StaffSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: StaffRoleSchema,
  organizationId: z.string().uuid(),
  venueId: z.string().uuid().nullable(),
});
export type StaffSummary = z.infer<typeof StaffSummarySchema>;

/**
 * Returned by every login/register endpoint. `token` is an opaque
 * bearer token (32 random bytes, base64url) — send it as
 * `Authorization: Bearer <token>`. `expiresAt` reflects the session TTL at
 * issuance (12h, sliding — see docs/api/FRONTEND_BACKEND_CONTRACT.md).
 */
export const StaffSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
  staff: StaffSummarySchema,
});
export type StaffSessionResponse = z.infer<typeof StaffSessionResponseSchema>;

/**
 * POST /v1/owner/register
 * Creates a brand-new organization + first venue + an `owner` staff row in
 * one call. No OTP/email confirmation in MVP (see docs/PRODUCT_SPEC_MVP.md
 * section 12 item 1 — deferred).
 */
export const OwnerRegisterRequestSchema = z.object({
  organizationName: z.string().min(1).max(200),
  venueName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type OwnerRegisterRequest = z.infer<typeof OwnerRegisterRequestSchema>;

export const OwnerRegisterResponseSchema = StaffSessionResponseSchema.extend({
  organizationId: z.string().uuid(),
  venueId: z.string().uuid(),
});
export type OwnerRegisterResponse = z.infer<typeof OwnerRegisterResponseSchema>;

/** POST /v1/staff/session/password — owner/manager login. */
export const PasswordLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;

/** POST /v1/staff/session/pin — waiter login, scoped to one venue. */
export const PinLoginRequestSchema = z.object({
  venueId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});
export type PinLoginRequest = z.infer<typeof PinLoginRequestSchema>;
