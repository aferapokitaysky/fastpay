import { EventEmitter } from "node:events";
import type { StaffRealtimeEvent } from "@fastpay/contracts";

/**
 * In-process, per-venue pub/sub for realtime delivery — deliberately NOT a
 * distributed bus (Redis pub/sub, etc.): this is a single-process Fastify
 * app, so an EventEmitter is the right amount of machinery. If the app is
 * ever run as multiple instances behind a load balancer, this stops being
 * sufficient (a WebSocket connected to instance A won't see an event
 * published from instance B) — that's a real, known limitation of this
 * scope, not an oversight; cross-instance delivery would need Redis
 * pub/sub or similar, deferred until horizontal scaling is actually needed.
 *
 * Durability doesn't depend on this module: every event is a
 * `realtime_events` row (see events.ts) before it's ever published here, so
 * a client that wasn't connected at publish time still gets it via the
 * reconnect catch-up query (routes/staffRealtime.ts) — this pub/sub is
 * purely the "push it immediately if someone's already listening" fast
 * path, not the source of truth.
 */
const emitter = new EventEmitter();
// Many venues can each have staff connected; avoid Node's default max-listeners warning noise.
emitter.setMaxListeners(0);

function channel(venueId: string): string {
  return `venue:${venueId}`;
}

export function publishToVenue(venueId: string, event: StaffRealtimeEvent): void {
  emitter.emit(channel(venueId), event);
}

/** Returns an unsubscribe function. */
export function subscribeToVenue(venueId: string, listener: (event: StaffRealtimeEvent) => void): () => void {
  emitter.on(channel(venueId), listener);
  return () => emitter.off(channel(venueId), listener);
}
