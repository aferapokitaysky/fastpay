import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * AES-256-GCM encryption for venue payment provider credentials at rest
 * (docs/PRODUCT_SPEC_MVP.md section 10: "секреты эквайринга зашифрованы at
 * rest"). Key comes from `PAYMENT_CREDENTIALS_ENCRYPTION_KEY` (32 raw bytes,
 * base64-encoded) — see config/env.ts and .env.example.
 *
 * Ciphertext is stored as `${ivBase64}.${authTagBase64}.${ciphertextBase64}`
 * so it's a single opaque text column (matches
 * venue_payment_configs.encrypted_credentials) with no separate columns for
 * IV/tag. A fresh random IV is generated per encryption call — GCM must
 * never reuse an (key, IV) pair.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV is the GCM-recommended size.

function getKey(): Buffer {
  const key = Buffer.from(env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(
      `PAYMENT_CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted credential (expected iv.authTag.ciphertext)");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
