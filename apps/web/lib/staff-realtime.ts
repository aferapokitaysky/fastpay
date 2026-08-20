export type StaffRealtimeEventType = "bill_requested" | "payment_started" | "payment_succeeded" | "payment_failed" | "order_updated" | "table_attention";
export type StaffRealtimeEvent = { id: string; type: StaffRealtimeEventType; occurredAt: string; venueId: string; table: { id: string; label: string }; orderId?: string; amountKopecks?: number; tipKopecks?: number; title: string; body?: string; action?: { label: string; kind: "open_table" | "resolve" | "retry" } };
type IncomingMessage = { type: "staff.event"; event: StaffRealtimeEvent } | { type: "ping" };
type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

/** WebSocket boundary; B3 backend work owns authentication and the final route. */
export function subscribeToStaffEvents({ onEvent, onState }: { onEvent: (event: StaffRealtimeEvent) => void; onState?: (state: ConnectionState) => void }) {
  const url = process.env.NEXT_PUBLIC_STAFF_WS_URL;
  if (!url || typeof WebSocket === "undefined") { onState?.("offline"); return () => undefined; }
  let socket: WebSocket | undefined; let stopped = false; let attempt = 0; let retry: number | undefined;
  const connect = () => { onState?.(attempt ? "reconnecting" : "connecting"); socket = new WebSocket(url); socket.onopen = () => { attempt = 0; onState?.("connected"); }; socket.onmessage = ({ data }) => { try { const message = JSON.parse(data) as IncomingMessage; if (message.type === "staff.event") onEvent(message.event); } catch { /* ignore invalid network payload */ } }; socket.onclose = () => { if (stopped) return; attempt += 1; retry = window.setTimeout(connect, Math.min(1_000 * 2 ** attempt, 30_000)); }; };
  connect();
  return () => { stopped = true; if (retry) window.clearTimeout(retry); socket?.close(); };
}
export const notificationCommand = (kind: "seen" | "resolved" | "archived", notificationId: string) => ({ type: `notification.${kind}`, notificationId });
