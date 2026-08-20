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
