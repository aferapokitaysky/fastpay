import argon2 from "argon2";

/**
 * Password/PIN hashing. Uses argon2id (memory-hard, current OWASP
 * recommendation) — it built and ran natively without issue in this
 * sandbox, so there was no need to fall back to bcrypt. Same primitive is
 * reused for both owner/manager passwords and waiter PINs; PINs are short
 * (4-6 digits) so hashing alone does not make them brute-forceable at
 * reasonable cost — the rate limiter in rateLimit.ts is the real defense
 * for PIN login, not the hash. See docs/PRODUCT_SPEC_MVP.md section 10.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id });
}

export async function verifyPin(hash: string, pin: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pin);
  } catch {
    return false;
  }
}
