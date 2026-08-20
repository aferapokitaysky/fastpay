import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";
import { registerOwner, createEmployee, authHeader, uniqueEmail } from "./helpers.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

describe("POST /v1/owner/register", () => {
  it("creates an organization, venue, and owner, and returns a working session", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("owner-register") });

    expect(owner.staff.role).toBe("owner");
    expect(owner.staff.venueId).toBeNull();
    expect(owner.organizationId).toBeTruthy();
    expect(owner.venueId).toBeTruthy();
    expect(owner.token).toBeTruthy();

    // The token actually works against an authenticated route.
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/venues",
      headers: authHeader(owner.token),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].id).toBe(owner.venueId);
  });
});

describe("POST /v1/staff/session/password", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail("owner-password-ok");
    const owner = await registerOwner(app, { email, password: "correct-horse-battery" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/session/password",
      payload: { email, password: "correct-horse-battery" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.staff.id).toBe(owner.staff.id);
    expect(body.token).toBeTruthy();
    expect(body.token).not.toBe(owner.token); // a fresh session, not the same one
  });

  it("rejects a wrong password with a generic 401 (not revealing which part was wrong)", async () => {
    const email = uniqueEmail("owner-password-wrong");
    await registerOwner(app, { email, password: "correct-horse-battery" });

    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/session/password",
      payload: { email, password: "totally-wrong" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks out after 5 failed attempts from the same email+IP", async () => {
    const email = uniqueEmail("owner-lockout");
    await registerOwner(app, { email, password: "correct-horse-battery" });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/staff/session/password",
        payload: { email, password: "wrong" },
      });
      expect(response.statusCode).toBe(401);
    }

    // 6th attempt is rate-limited even though the password would now be irrelevant.
    const locked = await app.inject({
      method: "POST",
      url: "/v1/staff/session/password",
      payload: { email, password: "wrong" },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe("RATE_LIMITED");

    // A CORRECT password is also rejected while locked out — the lockout isn't
    // bypassed just because the guess would have succeeded.
    const lockedWithCorrectPassword = await app.inject({
      method: "POST",
      url: "/v1/staff/session/password",
      payload: { email, password: "correct-horse-battery" },
    });
    expect(lockedWithCorrectPassword.statusCode).toBe(429);
  });
});

describe("POST /v1/staff/session/pin", () => {
  it("logs in a waiter with the correct venue+PIN", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("owner-for-pin") });
    const waiter = await createEmployee(app, owner.token, {
      name: "Waiter Pin Test",
      role: "waiter",
      venueId: owner.venueId,
      pin: "4321",
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId: owner.venueId, pin: "4321" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.staff.id).toBe(waiter.id);
    expect(body.staff.role).toBe("waiter");
    expect(body.staff.venueId).toBe(owner.venueId);
  });

  it("rejects a wrong PIN and locks out after 5 attempts (keyed by venue+IP)", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("owner-for-pin-lockout") });
    await createEmployee(app, owner.token, {
      name: "Waiter Pin Lockout",
      role: "waiter",
      venueId: owner.venueId,
      pin: "9999",
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/staff/session/pin",
        payload: { venueId: owner.venueId, pin: "0000" },
      });
      expect(response.statusCode).toBe(401);
    }

    const locked = await app.inject({
      method: "POST",
      url: "/v1/staff/session/pin",
      payload: { venueId: owner.venueId, pin: "0000" },
    });
    expect(locked.statusCode).toBe(429);
  });
});

describe("POST /v1/staff/session/logout", () => {
  it("invalidates the token so it can no longer authenticate", async () => {
    const owner = await registerOwner(app, { email: uniqueEmail("owner-logout") });

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/staff/session/logout",
      headers: authHeader(owner.token),
    });
    expect(logoutResponse.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/staff/venues",
      headers: authHeader(owner.token),
    });
    expect(afterLogout.statusCode).toBe(401);
  });
});

describe("requireAuth", () => {
  it("returns 401 for a missing bearer token", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/staff/venues" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for a garbage bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/venues",
      headers: authHeader("not-a-real-token"),
    });
    expect(response.statusCode).toBe(401);
  });
});
