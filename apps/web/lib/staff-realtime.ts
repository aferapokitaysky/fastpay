import { StaffRealtimeIncomingMessageSchema, type StaffRealtimeEvent } from "@fastpay/contracts";

export type { StaffRealtimeEvent } from "@fastpay/contracts";
type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

/** WebSocket boundary; B3 backend work owns authentication and the final route. */
export function subscribeToStaffEvents({ onEvent, onState }: { onEvent: (event: StaffRealtimeEvent) => void; onState?: (state: ConnectionState) => void }) {
  const url = process.env.NEXT_PUBLIC_STAFF_WS_URL;
  if (!url || typeof WebSocket === "undefined") { onState?.("offline"); return () => undefined; }
  let socket: WebSocket | undefined; let stopped = false; let attempt = 0; let retry: number | undefined;
  const connect = () => { onState?.(attempt ? "reconnecting" : "connecting"); socket = new WebSocket(url); socket.onopen = () => { attempt = 0; onState?.("connected"); }; socket.onmessage = ({ data }) => { try { const message = StaffRealtimeIncomingMessageSchema.safeParse(JSON.parse(data)); if (message.success && message.data.type === "staff.event") onEvent(message.data.event); } catch { /* ignore invalid network payload */ } }; socket.onclose = () => { if (stopped) return; attempt += 1; retry = window.setTimeout(connect, Math.min(1_000 * 2 ** attempt, 30_000)); }; };
  connect();
  return () => { stopped = true; if (retry) window.clearTimeout(retry); socket?.close(); };
}
export const notificationCommand = (kind: "seen" | "resolved" | "archived", notificationId: string) => ({ type: `notification.${kind}`, notificationId });
