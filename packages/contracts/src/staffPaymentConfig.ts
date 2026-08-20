import { z } from "zod";

/**
 * POST /v1/staff/venues/:id/payment-config (owner/manager only)
 * `credentials` is an opaque provider-specific secret string — never
 * returned in any response, encrypted at rest (AES-256-GCM, see
 * apps/api/src/utils/crypto.ts).
 */
export const SetPaymentConfigRequestSchema = z.object({
  provider: z.string().min(1),
  credentials: z.string().min(1),
});
export type SetPaymentConfigRequest = z.infer<typeof SetPaymentConfigRequestSchema>;

export const PaymentConfigResponseSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  configuredAt: z.string().datetime().nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
});
export type PaymentConfigResponse = z.infer<typeof PaymentConfigResponseSchema>;
