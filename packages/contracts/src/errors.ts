import { z } from "zod";

/**
 * Shared error envelope shape. See docs/api/FRONTEND_BACKEND_CONTRACT.md:
 *   { "error": { "code", "message", "requestId", "details" } }
 */
export const ErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ErrorEnvelopeSchema = z.object({
  error: ErrorBodySchema,
});

export type ErrorBody = z.infer<typeof ErrorBodySchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
