/**
 * Provider-agnostic acquiring adapter interface. This exists specifically so
 * FastPay never hard-wires a single acquirer into the payment domain — see
 * docs/COMPETITIVE_BRIEF.md section 0/5: the dominant local competitor
 * (Expirenza) is owned by monobank, which is also the acquirer FastPay
 * might otherwise default to exclusively. A real monobank (or any other)
 * adapter is deliberately deferred until real sandbox credentials exist —
 * see B2 task notes. Only `FakeProvider` (fakeProvider.ts) is wired up for
 * now, and it's what every B2 test runs against.
 */
export interface PaymentProvider {
  readonly name: string;

  /** Creates a checkout invoice at the provider for the given intent. */
  createInvoice(input: {
    paymentIntentId: string;
    /** Food + tip combined — what the guest actually owes. */
    amountKopecks: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerInvoiceId: string; checkoutUrl: string }>;

  /**
   * Verifies a webhook request's signature. Must be constant-time (no early
   * exit on mismatch) to avoid a timing side-channel — see fakeProvider.ts.
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>, secret: string): boolean;

  /** Parses a verified webhook body into a normalized event. Throws on malformed input. */
  parseWebhookEvent(rawBody: Buffer): {
    providerEventId: string;
    providerInvoiceId: string;
    status: "succeeded" | "failed" | "expired" | "cancelled";
    amountKopecks: number;
  };

  /**
   * Proves the plumbing (encrypt/decrypt/dispatch) works for a configured
   * venue — NOT a real connectivity check against an acquirer sandbox (see
   * fakeProvider.ts).
   */
  checkConnection(credentials: string): Promise<{ ok: boolean; message?: string }>;
}
