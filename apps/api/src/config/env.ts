import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .url("DATABASE_URL must be a valid postgres connection string"),
  REDIS_URL: z
    .string({ required_error: "REDIS_URL is required" })
    .url("REDIS_URL must be a valid redis connection string"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // AES-256-GCM key for encrypting venue payment provider credentials at
  // rest (apps/api/src/utils/crypto.ts) — 32 raw bytes, base64-encoded.
  // Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Never reuse across environments; rotating it invalidates every
  // already-stored venue_payment_configs.encrypted_credentials row (out of
  // scope for B2 — see HANDOFF).
  PAYMENT_CREDENTIALS_ENCRYPTION_KEY: z
    .string({ required_error: "PAYMENT_CREDENTIALS_ENCRYPTION_KEY is required" })
    .refine((value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    }, "PAYMENT_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  // HMAC pepper for guest_profiles.phone_hash (apps/api/src/utils/crypto.ts,
  // hashPhone) — B3 loyalty opt-in. Any non-empty string works (HMAC, not a
  // fixed-length cipher key like PAYMENT_CREDENTIALS_ENCRYPTION_KEY), but
  // treat it with the same care: never reuse across environments, rotating
  // it makes every existing guest_profiles row unrecognizable (a returning
  // guest's next visit just creates a new row instead of matching the old
  // one — not a data-loss bug, just silently loses loyalty history).
  //
  // NOTE for whoever edits CI: this must also be added to
  // .github/workflows/ci.yml's api job "Test" step env block, or every test
  // fails at import time — PAYMENT_CREDENTIALS_ENCRYPTION_KEY above shipped
  // in B2 without doing this and broke CI (see collaboration/HANDOFF.md,
  // "B2 done" — fixed same day, don't repeat it).
  GUEST_PHONE_HASH_PEPPER: z.string({ required_error: "GUEST_PHONE_HASH_PEPPER is required" }).min(1),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof EnvSchema>;
