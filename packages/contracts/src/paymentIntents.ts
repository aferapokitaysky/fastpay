import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";

export const PaymentIntentStatusSchema = z.enum([
  "created",
  "provider_pending",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
  "review_required",
]);
export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatusSchema>;

/**
 * POST /v1/public/tables/:token/payment-intents
 * `itemIds: "all"` reserves every currently-payable item on the active
 * order (the "Оплатити весь рахунок" guest flow); an explicit array is the
 * split-bill flow. `idempotencyKey` should be a client-generated random
 * string, stable across retries of the SAME checkout attempt (e.g.
 * regenerated only when the guest starts over) — resubmitting it returns
 * the existing intent instead of creating a duplicate.
 */
export const CreatePaymentIntentRequestSchema = z.object({
  itemIds: z.union([z.array(z.string().uuid()).min(1), z.literal("all")]),
  tipKopecks: MoneyKopecksSchema,
  idempotencyKey: z.string().min(1).max(200),
});
export type CreatePaymentIntentRequest = z.infer<typeof CreatePaymentIntentRequestSchema>;

export const PaymentIntentResponseSchema = z.object({
  paymentIntentId: z.string().uuid(),
  status: PaymentIntentStatusSchema,
  checkoutUrl: z.string().url().nullable(),
  amountFoodKopecks: MoneyKopecksSchema,
  amountTipKopecks: MoneyKopecksSchema,
  totalKopecks: MoneyKopecksSchema,
  currency: z.string().length(3),
  /** Reservation deadline — after this, the held items become payable by someone else again. */
  expiresAt: z.string().datetime(),
});
export type PaymentIntentResponse = z.infer<typeof PaymentIntentResponseSchema>;

/** GET /v1/public/payment-intents/:id — same shape; `status` is the only field a polling client needs to watch. */
export const GetPaymentIntentResponseSchema = PaymentIntentResponseSchema;
export type GetPaymentIntentResponse = z.infer<typeof GetPaymentIntentResponseSchema>;
