import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { StaffRealtimeEventSchema, type StaffRealtimeEvent } from "@fastpay/contracts";
import { realtimeEvents } from "../db/schema.js";
import * as schema from "../db/schema.js";

type DbOrTx = NodePgDatabase<typeof schema>;

type RealtimeEventType = (typeof realtimeEvents.$inferInsert)["type"];

interface RealtimeEventPayload {
  tableLabel: string;
  amountKopecks?: number;
  tipKopecks?: number;
  title: string;
  body?: string;
  action?: { label: string; kind: "open_table" | "resolve" | "retry" };
}

export interface InsertRealtimeEventInput {
  venueId: string;
  type: RealtimeEventType;
  tableId: string;
  tableLabel: string;
  orderId?: string;
  amountKopecks?: number;
  tipKopecks?: number;
  title: string;
  body?: string;
  action?: { label: string; kind: "open_table" | "resolve" | "retry" };
}

/**
 * Outbox write: call this INSIDE the same transaction as the state change
 * it describes (order request-bill, payment started/succeeded/failed,
 * order item mutation) — see db/schema.ts's realtime_events doc comment
 * for why this makes the event durable regardless of whether any staff
 * device is connected right now.
 *
 * Deliberately does NOT publish to realtime/pubsub.ts — that only happens
 * AFTER the caller's transaction actually commits (if it doesn't, this
 * event was never real). Callers: insert inside `db.transaction(tx => ...)`,
 * then call `publishToVenue` with the returned row's contract shape once
 * `db.transaction` has resolved successfully.
 */
export async function insertRealtimeEvent(
  tx: DbOrTx,
  input: InsertRealtimeEventInput,
): Promise<typeof realtimeEvents.$inferSelect> {
  const payload: RealtimeEventPayload = {
    tableLabel: input.tableLabel,
    amountKopecks: input.amountKopecks,
    tipKopecks: input.tipKopecks,
    title: input.title,
    body: input.body,
    action: input.action,
  };

  const [row] = await tx
    .insert(realtimeEvents)
    .values({
      venueId: input.venueId,
      type: input.type,
      tableId: input.tableId,
      orderId: input.orderId ?? null,
      payload,
    })
    .returning();
  if (!row) throw new Error("Failed to insert realtime event");
  return row;
}

/** Maps a realtime_events row to the wire contract shape (packages/contracts/src/staffRealtime.ts). */
export function toStaffRealtimeEvent(row: typeof realtimeEvents.$inferSelect): StaffRealtimeEvent {
  const payload = row.payload as RealtimeEventPayload;
  return StaffRealtimeEventSchema.parse({
    id: row.id,
    type: row.type,
    occurredAt: row.createdAt.toISOString(),
    venueId: row.venueId,
    table: { id: row.tableId, label: payload.tableLabel },
    orderId: row.orderId ?? undefined,
    amountKopecks: payload.amountKopecks,
    tipKopecks: payload.tipKopecks,
    title: payload.title,
    body: payload.body,
    action: payload.action,
  });
}
