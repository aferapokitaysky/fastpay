import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";

/**
 * Staff realtime inbox — WebSocket event contract. This formalizes exactly
 * the TypeScript shape Codex already implemented client-side in
 * `apps/web/lib/staff-realtime.ts` (see collaboration/INBOX.md COM-006):
 * the frontend adapter, reconnect logic, and command shapes are already
 * built against this shape — do not diverge from it without a new COM.
 *
 * The actual WebSocket server (auth handshake, venue/staff-scoped channel,
 * outbox-backed delivery) is B3, not yet implemented. This file exists so
 * both sides compile against one shared source of truth in the meantime,
 * per Codex's own request: "не изобретай endpoint... зафиксируй ожидаемый
 * контракт".
 */

export const StaffRealtimeEventTypeSchema = z.enum([
  "bill_requested",
  "payment_started",
  "payment_succeeded",
  "payment_failed",
  "order_updated",
  "table_attention",
]);
export type StaffRealtimeEventType = z.infer<typeof StaffRealtimeEventTypeSchema>;

/**
 * `id` must be stable and idempotency-safe — the client dedupes by it, and
 * a redelivered event (e.g. after WebSocket reconnect) must reuse the same
 * id rather than minting a new one. Never include card/payment secrets in
 * `title`/`body` (see COM-006 acceptance criteria).
 */
export const StaffRealtimeEventSchema = z.object({
  id: z.string(),
  type: StaffRealtimeEventTypeSchema,
  occurredAt: z.string().datetime(),
  venueId: z.string().uuid(),
  table: z.object({ id: z.string().uuid(), label: z.string() }),
  orderId: z.string().uuid().optional(),
  amountKopecks: MoneyKopecksSchema.optional(),
  tipKopecks: MoneyKopecksSchema.optional(),
  title: z.string(),
  body: z.string().optional(),
  action: z
    .object({
      label: z.string(),
      kind: z.enum(["open_table", "resolve", "retry"]),
    })
    .optional(),
});
export type StaffRealtimeEvent = z.infer<typeof StaffRealtimeEventSchema>;

/** Server -> client. `ping` is a plain keepalive; the client ignores anything else it doesn't recognize. */
export const StaffRealtimeIncomingMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("staff.event"), event: StaffRealtimeEventSchema }),
  z.object({ type: z.literal("ping") }),
]);
export type StaffRealtimeIncomingMessage = z.infer<typeof StaffRealtimeIncomingMessageSchema>;

/**
 * Client -> server. All three are idempotent by design (see COM-006
 * acceptance criteria) — replaying the same command must be a no-op, not
 * an error, since a flaky connection can cause the client to resend.
 */
export const StaffRealtimeCommandSchema = z.object({
  type: z.enum(["notification.seen", "notification.resolved", "notification.archived"]),
  notificationId: z.string(),
});
export type StaffRealtimeCommand = z.infer<typeof StaffRealtimeCommandSchema>;
