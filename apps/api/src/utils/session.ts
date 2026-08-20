import { redis } from "../redis/client.js";
import { generateOpaqueToken } from "./opaqueToken.js";
import type { StaffRole } from "@fastpay/contracts";

/**
 * Session TTL: 12h, sliding (refreshed on every authenticated request). 12h
 * comfortably covers a single shift (see docs/PRODUCT_SPEC_MVP.md section
 * 5.2 "смена") without staying valid indefinitely if a device is lost.
 */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const SESSION_KEY_PREFIX = "session:";

export interface SessionData {
  staffId: string;
  organizationId: string;
  venueId: string | null;
  role: StaffRole;
}

function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`;
}

/** Creates a new session and returns the bearer token to hand back to the client. */
export async function createSession(data: SessionData): Promise<string> {
  const token = generateOpaqueToken(32);
  await redis.set(sessionKey(token), JSON.stringify(data), "EX", SESSION_TTL_SECONDS);
  return token;
}

/** Reads a session and, if present, refreshes its TTL (sliding expiration). */
export async function getSession(token: string): Promise<SessionData | null> {
  const raw = await redis.get(sessionKey(token));
  if (!raw) return null;

  await redis.expire(sessionKey(token), SESSION_TTL_SECONDS);

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  await redis.del(sessionKey(token));
}

/** ISO-8601 timestamp for "now + one full session TTL" — used in login/register responses. */
export function sessionExpiresAtISOString(): string {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}
