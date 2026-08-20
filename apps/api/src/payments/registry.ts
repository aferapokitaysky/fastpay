import { FAKE_PROVIDER_NAME, FakeProvider } from "./fakeProvider.js";
import type { PaymentProvider } from "./provider.js";

/**
 * Every registered provider, by name. Only `fake` exists in B2 — see
 * provider.ts for why a real acquirer isn't wired up yet. Adding a real
 * provider later is additive: implement PaymentProvider, register it here,
 * nothing else in routes/ changes.
 */
const providers: Record<string, PaymentProvider> = {
  [FAKE_PROVIDER_NAME]: new FakeProvider(),
};

export function getProvider(name: string): PaymentProvider | undefined {
  return providers[name];
}

export function isKnownProvider(name: string): boolean {
  return name in providers;
}
