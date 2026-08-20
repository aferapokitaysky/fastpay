import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentProvider } from "./provider.js";

/**
 * Deterministic, fully-local fake acquirer. This is the only provider wired
 * up in B2 (see provider.ts for why) and the only one any test runs
 * against. Webhook signing is a real HMAC-SHA256 scheme (not a no-op) so
 * tests genuinely exercise signature verification end to end through the
 * real `POST /v1/webhooks/fake` route — see buildSignedFakeWebhookRequest
 * below, used by test/helpers.ts.
 */
export const FAKE_PROVIDER_NAME = "fake";

const SIGNATURE_HEADER = "x-fake-signature";

export const FakeWebhookPayloadSchema = z.object({
  providerEventId: z.string().min(1),
  providerInvoiceId: z.string().min(1),
  status: z.enum(["succeeded", "failed", "expired", "cancelled"]),
  amountKopecks: z.number().int().nonnegative(),
});
export type FakeWebhookPayload = z.infer<typeof FakeWebhookPayloadSchema>;

function fakeProviderInvoiceId(paymentIntentId: string): string {
  return `fake_inv_${paymentIntentId}`;
}

function signFakePayload(secret: string, rawBody: Buffer): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Test helper: builds a validly-signed fake webhook request (raw body +
 * headers) for a given payload, so tests POST through the real route
 * instead of calling internal functions directly. Lives here (not
 * test/helpers.ts) because it's about the fake provider's wire format, the
 * same reason FakeProvider.verifyWebhookSignature/parseWebhookEvent live
 * here.
 */
export function buildSignedFakeWebhookRequest(
  secret: string,
  payload: FakeWebhookPayload,
): { rawBody: Buffer; headers: Record<string, string> } {
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
  return {
    rawBody,
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: signFakePayload(secret, rawBody),
    },
  };
}

export class FakeProvider implements PaymentProvider {
  readonly name = FAKE_PROVIDER_NAME;

  async createInvoice(input: {
    paymentIntentId: string;
    amountKopecks: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerInvoiceId: string; checkoutUrl: string }> {
    const providerInvoiceId = fakeProviderInvoiceId(input.paymentIntentId);
    return {
      providerInvoiceId,
      checkoutUrl: `https://fake-provider.test/checkout/${providerInvoiceId}`,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>, secret: string): boolean {
    const provided = headers[SIGNATURE_HEADER];
    if (!provided) return false;

    const expected = signFakePayload(secret, rawBody);
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(provided, "hex");
    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  }

  parseWebhookEvent(rawBody: Buffer): {
    providerEventId: string;
    providerInvoiceId: string;
    status: "succeeded" | "failed" | "expired" | "cancelled";
    amountKopecks: number;
  } {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new Error("Malformed webhook payload: not valid JSON");
    }
    return FakeWebhookPayloadSchema.parse(json);
  }

  async checkConnection(credentials: string): Promise<{ ok: boolean; message?: string }> {
    if (credentials.trim().length === 0) {
      return { ok: false, message: "Credentials must not be empty" };
    }
    return { ok: true };
  }
}
