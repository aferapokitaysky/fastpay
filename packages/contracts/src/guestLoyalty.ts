import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";

/**
 * Guest loyalty opt-in/out — voluntary, phone-only, offered on the
 * post-payment "thank you" screen (docs/PRODUCT_SPEC_MVP.md section 10).
 * Both endpoints hang off a concrete `paymentIntentId` rather than a bare
 * phone number: the organization a guest profile belongs to is derived
 * server-side from that payment intent's order, the same trust boundary the
 * opt-in itself uses. A route keyed by raw phone with no order context would
 * need some other way to resolve which organization's guest_profiles table
 * to touch — not worth inventing for this MVP. Never returns the phone or
 * its hash in any response.
 */
export const LoyaltyOptInRequestSchema = z.object({
  phone: z.string().min(3).max(32),
});
export type LoyaltyOptInRequest = z.infer<typeof LoyaltyOptInRequestSchema>;

export const LoyaltyProfileResponseSchema = z.object({
  optedIn: z.boolean(),
  visitCount: z.number().int().positive(),
  totalSpentKopecks: MoneyKopecksSchema,
});
export type LoyaltyProfileResponse = z.infer<typeof LoyaltyProfileResponseSchema>;

export const LoyaltyOptOutRequestSchema = z.object({
  phone: z.string().min(3).max(32),
});
export type LoyaltyOptOutRequest = z.infer<typeof LoyaltyOptOutRequestSchema>;

/**
 * Pragmatic MVP delete: the guest resubmits the same phone number they
 * opted in with, we hash it and delete the matching row if any. This is NOT
 * a verified-identity flow (no OTP/SMS confirmation) — anyone who knows a
 * guest's phone number and which restaurant they visited could delete that
 * guest's loyalty record. Acceptable for a voluntary, low-stakes MVP
 * feature; would need real verification before this could be called a
 * GDPR-complete erasure flow.
 */
export const LoyaltyDeleteResponseSchema = z.object({
  deleted: z.boolean(),
});
export type LoyaltyDeleteResponse = z.infer<typeof LoyaltyDeleteResponseSchema>;
