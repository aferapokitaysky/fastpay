import {
  CreatePaymentIntentRequestSchema,
  ErrorEnvelopeSchema,
  GetPaymentIntentResponseSchema,
  PaymentIntentResponseSchema,
  type CreatePaymentIntentRequest,
} from "@fastpay/contracts";
import { StaffApiError } from "./staff-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init: RequestInit, schema: { parse: (data: unknown) => T }): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...init.headers }, cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ErrorEnvelopeSchema.safeParse(payload);
    throw new StaffApiError(error.success ? error.data.error.code : "NETWORK_ERROR", error.success ? error.data.error.requestId : undefined, error.success ? error.data.error.details : undefined, error.success ? error.data.error.message : "Не вдалося створити платіж");
  }
  return schema.parse(payload);
}

export const publicPaymentApi = {
  createIntent: (token: string, body: CreatePaymentIntentRequest) => request(`/v1/public/tables/${encodeURIComponent(token)}/payment-intents`, { method: "POST", body: JSON.stringify(CreatePaymentIntentRequestSchema.parse(body)) }, PaymentIntentResponseSchema),
  getIntent: (id: string) => request(`/v1/public/payment-intents/${id}`, { method: "GET" }, GetPaymentIntentResponseSchema),
};
