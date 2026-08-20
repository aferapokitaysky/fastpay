import { describe, expect, it } from "vitest";
import {
  PublicBillResponseSchema,
  ErrorEnvelopeSchema,
  MoneyKopecksSchema,
  StaffRealtimeEventSchema,
  StaffRealtimeIncomingMessageSchema,
  StaffRealtimeCommandSchema,
} from "@fastpay/contracts";

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

describe("StaffRealtimeEventSchema (matches apps/web/lib/staff-realtime.ts exactly — see COM-006)", () => {
  const VALID_EVENT = {
    id: "evt-1",
    type: "bill_requested",
    occurredAt: "2026-08-20T12:00:00Z",
    venueId: "1f232e0e-91e9-499c-8a4b-2b1fde64f39e",
    table: { id: "88123d17-3620-4251-93db-7f8b13f9bee6", label: "02" },
    orderId: "eb7298f6-2bbd-4653-814c-b127652103a7",
    amountKopecks: 124000,
    title: "Стіл 02 просить рахунок",
    action: { label: "Відкрити стіл", kind: "open_table" },
  };

  it("parses a full event with all optional fields", () => {
    expect(() => StaffRealtimeEventSchema.parse(VALID_EVENT)).not.toThrow();
  });

  it("parses a minimal event without any optional fields", () => {
    const minimal = {
      id: "evt-2",
      type: "table_attention",
      occurredAt: "2026-08-20T12:00:00Z",
      venueId: VALID_EVENT.venueId,
      table: VALID_EVENT.table,
      title: "Стіл 04 потребує уваги",
    };
    expect(() => StaffRealtimeEventSchema.parse(minimal)).not.toThrow();
  });

  it("rejects an unknown event type", () => {
    expect(() => StaffRealtimeEventSchema.parse({ ...VALID_EVENT, type: "something_else" })).toThrow();
  });

  it("parses the staff.event envelope and the ping keepalive", () => {
    expect(() =>
      StaffRealtimeIncomingMessageSchema.parse({ type: "staff.event", event: VALID_EVENT }),
    ).not.toThrow();
    expect(() => StaffRealtimeIncomingMessageSchema.parse({ type: "ping" })).not.toThrow();
  });

  it("parses every client command kind", () => {
    for (const kind of ["notification.seen", "notification.resolved", "notification.archived"]) {
      expect(() =>
        StaffRealtimeCommandSchema.parse({ type: kind, notificationId: "evt-1" }),
      ).not.toThrow();
    }
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
