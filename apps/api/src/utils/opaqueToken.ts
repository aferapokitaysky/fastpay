import { randomBytes } from "node:crypto";

/**
 * Cryptographically random, URL-safe opaque token. Used for both table QR
 * tokens (capability URLs — see docs/PRODUCT_SPEC_MVP.md section 10) and
 * session bearer tokens. 24 random bytes -> 32 base64url chars for QR
 * tokens; session tokens use 32 bytes per the B1 task spec.
 */
export function generateOpaqueToken(byteLength = 24): string {
  return randomBytes(byteLength).toString("base64url");
}
