import {
  CreateTableRequestSchema,
  CreateEmployeeRequestSchema,
  CreateMenuItemRequestSchema,
  CreateFloorRequestSchema,
  ErrorEnvelopeSchema,
  ListFloorsResponseSchema,
  ListEmployeesResponseSchema,
  ListMenuItemsResponseSchema,
  ListTablesResponseSchema,
  ListVenuesResponseSchema,
  OwnerRegisterRequestSchema,
  OwnerRegisterResponseSchema,
  PasswordLoginRequestSchema,
  PaymentConfigResponseSchema,
  RotateQrResponseSchema,
  SetPaymentConfigRequestSchema,
  StaffMenuItemSchema,
  StaffEmployeeSchema,
  StaffFloorSchema,
  StaffSessionResponseSchema,
  StaffTableSchema,
  UpdateMenuItemRequestSchema,
  type OwnerRegisterRequest,
  type CreateMenuItemRequest,
  type CreateEmployeeRequest,
  type PasswordLoginRequest,
  type PaymentConfigResponse,
  type SetPaymentConfigRequest,
  type UpdateMenuItemRequest,
  type StaffEmployee,
  type StaffSessionResponse,
} from "@fastpay/contracts";
import { StaffApiError } from "./staff-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const EmptyResponseSchema = { parse: (_data: unknown): undefined => undefined };

async function request<T>(path: string, init: RequestInit, schema: { parse: (data: unknown) => T }, token?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = ErrorEnvelopeSchema.safeParse(payload);
    throw new StaffApiError(
      error.success ? error.data.error.code : "NETWORK_ERROR",
      error.success ? error.data.error.requestId : undefined,
      error.success ? error.data.error.details : undefined,
      error.success ? error.data.error.message : "Не вдалося виконати запит",
    );
  }
  return schema.parse(payload);
}

export const ownerApi = {
  register: (body: OwnerRegisterRequest) => request("/v1/owner/register", { method: "POST", body: JSON.stringify(OwnerRegisterRequestSchema.parse(body)) }, OwnerRegisterResponseSchema),
  login: (body: PasswordLoginRequest) => request("/v1/staff/session/password", { method: "POST", body: JSON.stringify(PasswordLoginRequestSchema.parse(body)) }, StaffSessionResponseSchema),
  listVenues: (token: string) => request("/v1/staff/venues", { method: "GET" }, ListVenuesResponseSchema, token),
  listFloors: (venueId: string, token: string) => request(`/v1/staff/venues/${venueId}/floors`, { method: "GET" }, ListFloorsResponseSchema, token),
  createFloor: (venueId: string, name: string, token: string) => request(`/v1/staff/venues/${venueId}/floors`, { method: "POST", body: JSON.stringify(CreateFloorRequestSchema.parse({ name })), headers: { "idempotency-key": crypto.randomUUID() } }, StaffFloorSchema, token),
  listTables: (floorId: string, token: string) => request(`/v1/staff/floors/${floorId}/tables`, { method: "GET" }, ListTablesResponseSchema, token),
  createTable: (floorId: string, label: string, token: string) => request(`/v1/staff/floors/${floorId}/tables`, { method: "POST", body: JSON.stringify(CreateTableRequestSchema.parse({ label })), headers: { "idempotency-key": crypto.randomUUID() } }, StaffTableSchema, token),
  rotateQr: (tableId: string, token: string) => request(`/v1/staff/tables/${tableId}/rotate-qr`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } }, RotateQrResponseSchema, token),
  getPaymentConfig: (venueId: string, token: string) => request(`/v1/staff/venues/${venueId}/payment-config`, { method: "GET" }, PaymentConfigResponseSchema, token),
  setPaymentConfig: (venueId: string, body: SetPaymentConfigRequest, token: string) => request(`/v1/staff/venues/${venueId}/payment-config`, { method: "POST", body: JSON.stringify(SetPaymentConfigRequestSchema.parse(body)), headers: { "idempotency-key": crypto.randomUUID() } }, PaymentConfigResponseSchema, token),
  listMenuItems: (venueId: string, token: string) => request(`/v1/staff/venues/${venueId}/menu-items`, { method: "GET" }, ListMenuItemsResponseSchema, token),
  createMenuItem: (venueId: string, body: CreateMenuItemRequest, token: string) => request(`/v1/staff/venues/${venueId}/menu-items`, { method: "POST", body: JSON.stringify(CreateMenuItemRequestSchema.parse(body)), headers: { "idempotency-key": crypto.randomUUID() } }, StaffMenuItemSchema, token),
  updateMenuItem: (menuItemId: string, body: UpdateMenuItemRequest, token: string) => request(`/v1/staff/menu-items/${menuItemId}`, { method: "PATCH", body: JSON.stringify(UpdateMenuItemRequestSchema.parse(body)), headers: { "idempotency-key": crypto.randomUUID() } }, StaffMenuItemSchema, token),
  listEmployees: (token: string) => request("/v1/staff/employees", { method: "GET" }, ListEmployeesResponseSchema, token),
  createEmployee: (body: CreateEmployeeRequest, token: string) => request("/v1/staff/employees", { method: "POST", body: JSON.stringify(CreateEmployeeRequestSchema.parse(body)), headers: { "idempotency-key": crypto.randomUUID() } }, StaffEmployeeSchema, token),
  logout: (token: string) => request("/v1/staff/session/logout", { method: "POST" }, EmptyResponseSchema, token),
};

export const storeOwnerSession = (session: StaffSessionResponse) => sessionStorage.setItem("rimvo.owner.session", JSON.stringify(session));
export const readOwnerSession = (): StaffSessionResponse | null => {
  try {
    return StaffSessionResponseSchema.parse(JSON.parse(sessionStorage.getItem("rimvo.owner.session") ?? "null"));
  } catch {
    return null;
  }
};
export const clearOwnerSession = () => sessionStorage.removeItem("rimvo.owner.session");
