import { redis } from "../redis/client.js";

/**
 * Redis-backed fixed-window rate limiter: 5 failed attempts / 15 minutes ->
 * lock out. Used for both PIN and password login. Key scheme (deliberately
 * chosen so a single dimension alone can't be used to lock someone else out
 * or cheaply enumerate valid identifiers):
 *   - PIN login:      `ratelimit:pin:<venueId>:<ip>`
 *   - Password login: `ratelimit:password:<email-lowercased>:<ip>`
 * Scoping by identifier+IP (not identifier alone) means a single malicious
 * IP can't lock out a whole venue/email from every other IP, and scoping by
 * IP+identifier (not IP alone) means one IP can't be used to cheaply brute
 * force many different venues/emails without each one accumulating its own
 * counter. This is a documented MVP tradeoff, not a complete defense — see
 * the PIN security note in staffAuth routes.
 */
const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

export interface RateLimitStatus {
  limited: boolean;
  remaining: number;
}

function rateLimitKey(scope: string, identifier: string, ip: string): string {
  return `ratelimit:${scope}:${identifier}:${ip}`;
}

/** Call before attempting the login. Does not consume an attempt. */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  ip: string,
): Promise<RateLimitStatus> {
  const key = rateLimitKey(scope, identifier, ip);
  const raw = await redis.get(key);
  const count = raw ? Number(raw) : 0;
  return { limited: count >= MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - count) };
}

/** Call after a failed login attempt. Increments the window counter. */
export async function recordFailedAttempt(
  scope: string,
  identifier: string,
  ip: string,
): Promise<void> {
  const key = rateLimitKey(scope, identifier, ip);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
}

/** Call after a successful login attempt to clear the counter for that identifier+IP. */
export async function clearRateLimit(scope: string, identifier: string, ip: string): Promise<void> {
  await redis.del(rateLimitKey(scope, identifier, ip));
}
