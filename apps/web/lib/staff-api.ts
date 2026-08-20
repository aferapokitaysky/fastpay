import { ErrorEnvelopeSchema, ListMenuItemsResponseSchema, PinLoginRequestSchema, StaffFloorSnapshotResponseSchema, StaffOrderSchema, StaffSessionResponseSchema, type CloseOrderRequest, type OrderItemOperation, type StaffSessionResponse } from "@fastpay/contracts";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const EmptyResponseSchema = { parse: (_data: unknown): undefined => undefined };

export class StaffApiError extends Error {
  constructor(public readonly code: string, public readonly requestId?: string, public readonly details?: Record<string, unknown>, message?: string) { super(message ?? code); }
}

async function request<T>(path: string, init: RequestInit, schema: { parse: (data: unknown) => T }, token?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers }, cache: "no-store" });
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) { const error = ErrorEnvelopeSchema.safeParse(payload); throw new StaffApiError(error.success ? error.data.error.code : "NETWORK_ERROR", error.success ? error.data.error.requestId : undefined, error.success ? error.data.error.details : undefined, error.success ? error.data.error.message : "Не вдалося виконати запит"); }
  return schema.parse(payload);
}

export const staffApi = {
  loginWithPin: (venueId: string, pin: string) => request("/v1/staff/session/pin", { method: "POST", body: JSON.stringify(PinLoginRequestSchema.parse({ venueId, pin })) }, StaffSessionResponseSchema),
  getFloorSnapshot: (token: string) => request("/v1/staff/floor", { method: "GET" }, StaffFloorSnapshotResponseSchema, token),
  getMenuItems: (venueId: string, token: string) => request("/v1/staff/venues/" + venueId + "/menu-items", { method: "GET" }, ListMenuItemsResponseSchema, token),
  getOrder: (orderId: string, token: string) => request("/v1/staff/orders/" + orderId, { method: "GET" }, StaffOrderSchema, token),
  openOrder: (tableId: string, token: string) => request("/v1/staff/tables/" + tableId + "/orders", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } }, StaffOrderSchema, token),
  updateOrder: (orderId: string, version: number, operations: OrderItemOperation[], token: string) => request("/v1/staff/orders/" + orderId, { method: "PATCH", body: JSON.stringify({ version, operations }), headers: { "idempotency-key": crypto.randomUUID() } }, StaffOrderSchema, token),
  requestBill: (orderId: string, version: number, token: string) => request("/v1/staff/orders/" + orderId + "/request-bill", { method: "POST", body: JSON.stringify({ version }), headers: { "idempotency-key": crypto.randomUUID() } }, StaffOrderSchema, token),
  closeOrder: (orderId: string, body: CloseOrderRequest, token: string) => request("/v1/staff/orders/" + orderId + "/close", { method: "POST", body: JSON.stringify(body), headers: { "idempotency-key": crypto.randomUUID() } }, StaffOrderSchema, token),
  logout: (token: string) => request("/v1/staff/session/logout", { method: "POST" }, EmptyResponseSchema, token),
};

export const storeStaffSession = (session: StaffSessionResponse) => sessionStorage.setItem("rimvo.staff.session", JSON.stringify(session));
export const readStaffSession = (): StaffSessionResponse | null => { try { return StaffSessionResponseSchema.parse(JSON.parse(sessionStorage.getItem("rimvo.staff.session") ?? "null")); } catch { return null; } };
export const clearStaffSession = () => sessionStorage.removeItem("rimvo.staff.session");
