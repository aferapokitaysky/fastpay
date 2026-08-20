import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicBillResponseSchema } from "@fastpay/contracts";
import { buildApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { redis } from "../src/redis/client.js";
import { seedDemoData, type SeedResult } from "../src/db/seed.js";

const app = buildApp();
let seeded: SeedResult;

beforeAll(async () => {
  seeded = await seedDemoData();
});

afterAll(async () => {
  await app.close();
  await pool.end();
  redis.disconnect();
});

describe("GET /v1/public/tables/:token/bill", () => {
  it("returns the contract shape for a seeded token", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/public/tables/${seeded.qrToken}/bill`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    const parsed = PublicBillResponseSchema.parse(body);
    expect(parsed.venue.name).toBe("Goodman");
    expect(parsed.table.label).toBe("02");
    expect(parsed.order).not.toBeNull();
    expect(parsed.order?.status).toBe("bill_requested");
    expect(parsed.order?.items.length).toBeGreaterThan(0);
    expect(parsed.order?.outstandingFoodKopecks).toBeGreaterThan(0);
    expect(parsed.tips).toEqual({ percentOptions: [5, 10, 15], customAllowed: true });

    const burger = parsed.order?.items.find((item) => item.name === "Бургер");
    expect(burger).toMatchObject({
      quantity: 1,
      unitPriceKopecks: 32000,
      remainingKopecks: 32000,
      paymentStatus: "unpaid",
    });
  });

  it("returns 404 with the standard error envelope for an unknown token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/tables/does-not-exist/bill",
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toMatchObject({
      code: "TABLE_NOT_FOUND",
    });
    expect(typeof body.error.requestId).toBe("string");
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });
});
