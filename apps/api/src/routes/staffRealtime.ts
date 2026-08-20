import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { StaffRealtimeCommandSchema } from "@fastpay/contracts";
import { db } from "../db/client.js";
import { realtimeEvents, venues } from "../db/schema.js";
import { getSession } from "../utils/session.js";
import { subscribeToVenue } from "../realtime/pubsub.js";
import { toStaffRealtimeEvent } from "../realtime/events.js";

/**
 * GET /v1/staff/realtime — WebSocket. Browsers can't set custom headers on
 * the WS handshake, so auth is a query param (`?token=...`) rather than
 * `Authorization: Bearer` like every other staff route — resolved through
 * the exact same Redis session lookup (utils/session.ts) so it's the same
 * trust boundary, just a different transport for the token. Anyone who can
 * see this URL (server logs, browser history) can see the token for its
 * remaining TTL — a known, standard tradeoff for browser WebSocket auth,
 * not an oversight; the token is already short-lived (12h sliding) and
 * WSS encrypts it in transit.
 *
 * Scope: an `owner` session (venueId: null) subscribes to every venue in
 * their organization; `manager`/`waiter` subscribe to their one venue —
 * identical scoping rule to every other staff route.
 *
 * Codex (apps/web/lib/staff-realtime.ts) needs exactly one client-side
 * change to use this: append `?token=<sessionToken>` to whatever
 * NEXT_PUBLIC_STAFF_WS_URL resolves to before opening the WebSocket. See
 * COM-010 for the full handoff note.
 */

const CATCHUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const PING_INTERVAL_MS = 30_000;

const STATUS_RANK: Record<string, number> = { pending: 0, seen: 1, resolved: 2, archived: 2 };

async function resolveVenueIds(organizationId: string, venueId: string | null): Promise<string[]> {
  if (venueId) return [venueId];
  const rows = await db.select({ id: venues.id }).from(venues).where(eq(venues.organizationId, organizationId));
  return rows.map((row) => row.id);
}

export async function staffRealtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/staff/realtime", { websocket: true }, async (socket, request) => {
    const token = (request.query as { token?: string }).token;
    const session = token ? await getSession(token) : null;
    if (!session) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const venueIds = await resolveVenueIds(session.organizationId, session.venueId);
    if (venueIds.length === 0) {
      socket.close(4404, "No venues");
      return;
    }

    const send = (message: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    // Catch-up burst: anything not yet resolved/archived from the last 24h,
    // so a reconnecting client is caught up on everything it might have
    // missed while disconnected — this, not a separate retry/DLQ table, is
    // what makes the outbox durable across connection gaps (see
    // realtime/pubsub.ts doc comment).
    const since = new Date(Date.now() - CATCHUP_WINDOW_MS);
    const backlog = await db
      .select()
      .from(realtimeEvents)
      .where(
        and(
          inArray(realtimeEvents.venueId, venueIds),
          or(eq(realtimeEvents.status, "pending"), eq(realtimeEvents.status, "seen")),
          gt(realtimeEvents.createdAt, since),
        ),
      )
      .orderBy(desc(realtimeEvents.createdAt));
    for (const row of backlog.reverse()) {
      send({ type: "staff.event", event: toStaffRealtimeEvent(row) });
    }

    const unsubscribers = venueIds.map((venueId) =>
      subscribeToVenue(venueId, (event) => send({ type: "staff.event", event })),
    );

    const pingTimer = setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);

    socket.on("message", (raw: Buffer) => {
      void (async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString("utf8"));
        } catch {
          return; // Malformed client frame — ignore, don't crash the connection over it.
        }
        const command = StaffRealtimeCommandSchema.safeParse(parsed);
        if (!command.success) return;

        const [existing] = await db
          .select()
          .from(realtimeEvents)
          .where(eq(realtimeEvents.id, command.data.notificationId))
          .limit(1);
        // Tenant isolation: silently ignore a notificationId outside this
        // connection's own scoped venues, same discipline as every REST
        // route (never confirm/deny existence of another tenant's data).
        if (!existing || !venueIds.includes(existing.venueId)) return;

        const newStatus = command.data.type.split(".")[1] as "seen" | "resolved" | "archived";
        // Forward-only: pending -> seen -> resolved/archived. Re-applying
        // the same status, or an out-of-order one, is a documented no-op,
        // never an error — a flaky connection can cause the client to
        // resend a command it already believes succeeded.
        if (STATUS_RANK[newStatus]! <= STATUS_RANK[existing.status]!) return;

        await db.update(realtimeEvents).set({ status: newStatus }).where(eq(realtimeEvents.id, existing.id));
      })();
    });

    socket.on("close", () => {
      clearInterval(pingTimer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    });
  });
}
