import { describe, expect, it } from "vitest";
import { PublicBillResponseSchema, ErrorEnvelopeSchema, MoneyKopecksSchema } from "@fastpay/contracts";

// Exact example from docs/api/FRONTEND_BACKEND_CONTRACT.md — treated as ground truth.
const VALID_PUBLIC_BILL_EXAMPLE = {
  venue: { name: "Goodman", logoUrl: null },
  table: { label: "02" },
  order: {
    id: "opaque-public-id",
    status: "bill_requested",
    version: 12,
    items: [
      {
        id: "public-item-id",
        name: "Бургер",
        quantity: 1,
        unitPriceKopecks: 32000,
        remainingKopecks: 32000,
        paymentStatus: "unpaid",
      },
    ],
    outstandingFoodKopecks: 124000,
    currency: "UAH",
    updatedAt: "2026-08-20T12:00:00Z",
  },
  tips: { percentOptions: [5, 10, 15], customAllowed: true },
};

describe("PublicBillResponseSchema", () => {
  it("parses the exact contract example", () => {
    expect(() => PublicBillResponseSchema.parse(VALID_PUBLIC_BILL_EXAMPLE)).not.toThrow();
  });

  it("accepts order: null for the no-active-order case", () => {
    const noOrder = { ...VALID_PUBLIC_BILL_EXAMPLE, order: null };
    expect(() => PublicBillResponseSchema.parse(noOrder)).not.toThrow();
  });

  it("rejects a payload with a float in amountKopecks", () => {
    const invalid = {
      ...VALID_PUBLIC_BILL_EXAMPLE,
      order: {
        ...VALID_PUBLIC_BILL_EXAMPLE.order,
        outstandingFoodKopecks: 124000.5,
      },
    };
    expect(() => PublicBillResponseSchema.parse(invalid)).toThrow();
  });

  it("rejects a payload missing required fields", () => {
    const { venue: _venue, ...invalid } = VALID_PUBLIC_BILL_EXAMPLE;
    expect(() => PublicBillResponseSchema.parse(invalid)).toThrow();
  });
});

describe("ErrorEnvelopeSchema", () => {
  it("parses a standard error envelope", () => {
    const envelope = {
      error: {
        code: "TABLE_NOT_FOUND",
        message: "No table matches this QR token",
        requestId: "req-123",
      },
    };
    expect(() => ErrorEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it("rejects an envelope missing the error wrapper", () => {
    expect(() => ErrorEnvelopeSchema.parse({ code: "X", message: "Y", requestId: "z" })).toThrow();
  });
});

describe("MoneyKopecksSchema", () => {
  it("accepts non-negative integers", () => {
    expect(MoneyKopecksSchema.parse(0)).toBe(0);
    expect(MoneyKopecksSchema.parse(32000)).toBe(32000);
  });

  it("rejects negative numbers and non-integers", () => {
    expect(() => MoneyKopecksSchema.parse(-1)).toThrow();
    expect(() => MoneyKopecksSchema.parse(1.5)).toThrow();
  });
});
