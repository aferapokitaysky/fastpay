import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

describe("GET /health", () => {
  it("returns 200 with no dependency checks", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

describe("GET /ready", () => {
  it("returns 200 when Postgres and Redis are reachable", async () => {
    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", postgres: "ok", redis: "ok" });
  });
});
