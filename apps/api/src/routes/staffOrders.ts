import type { FastifyInstance } from "fastify";
import { and, eq, ne } from "drizzle-orm";
import {
  CloseOrderRequestSchema,
  CloseOrderResponseSchema,
  ORDER_EDITABLE_STATUSES,
  OpenOrderResponseSchema,
  RequestBillRequestSchema,
  RequestBillResponseSchema,
  UpdateOrderRequestSchema,
  UpdateOrderResponseSchema,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { menuItems, orderItems, orders } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { assertVenueAccess, getOrgOrderOrThrow, getOrgTableOrThrow } from "../lib/scoping.js";
import { loadStaffOrder } from "../lib/orderState.js";
import { recordAuditEvent } from "../lib/audit.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../middleware/errorHandler.js";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function versionConflict(orderId: string) {
  const currentOrder = await loadStaffOrder(orderId);
  return new ConflictError("ORDER_VERSION_CONFLICT", "Order was modified by someone else", {
    currentOrder,
  });
}

/**
 * Orders: staff-authenticated (any role), scoped to the caller's own venue
 * — see docs/PRODUCT_SPEC_MVP.md section 4/5.2 and the B1 task spec.
 */
export async function staffOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/v1/staff/orders/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const { organizationId } = request.staff!;
      const order = await getOrgOrderOrThrow(request.params.id, organizationId);
      assertVenueAccess(request.staff!, order.venueId);
      return OpenOrderResponseSchema.parse(await loadStaffOrder(order.id));
    },
  );

  // POST /v1/staff/tables/:id/orders — opens a new order.
  // Enforces "one non-closed order per table": the transaction below
  // checks-then-inserts for a clean 409, and the partial unique index
  // orders_one_active_per_table_idx (see db/schema.ts) is what actually
  // prevents the race under concurrent inserts — a losing concurrent
  // request hits a unique_violation, which we translate to the same 409.
  app.post<{ Params: { id: string } }>(
    "/v1/staff/tables/:id/orders",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { organizationId } = request.staff!;
      const table = await getOrgTableOrThrow(request.params.id, organizationId);
      assertVenueAccess(request.staff!, table.venueId);

      let orderId: string;
      try {
        orderId = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(and(eq(orders.tableId, table.id), ne(orders.status, "closed")))
            .limit(1);
          if (existing) {
            throw new ConflictError("TABLE_HAS_ACTIVE_ORDER", "This table already has an active order");
          }

          const [inserted] = await tx
            .insert(orders)
            .values({ tableId: table.id, status: "open", version: 1 })
            .returning({ id: orders.id });
          if (!inserted) throw new Error("Failed to create order");
          return inserted.id;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("TABLE_HAS_ACTIVE_ORDER", "This table already has an active order");
        }
        throw error;
      }

      reply.status(201);
      return OpenOrderResponseSchema.parse(await loadStaffOrder(orderId));
    },
  );

  // PATCH /v1/staff/orders/:id — add/update/remove order items.
  app.patch<{ Params: { id: string } }>(
    "/v1/staff/orders/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const { organizationId } = request.staff!;
      const body = UpdateOrderRequestSchema.parse(request.body);
      const existing = await getOrgOrderOrThrow(request.params.id, organizationId);
      assertVenueAccess(request.staff!, existing.venueId);

      if (!ORDER_EDITABLE_STATUSES.includes(existing.status)) {
        throw new ConflictError(
          "ORDER_NOT_EDITABLE",
          `Order cannot be edited while status is "${existing.status}"`,
        );
      }
      if (body.version !== existing.version) {
        throw await versionConflict(existing.id);
      }

      await db.transaction(async (tx) => {
        for (const op of body.operations) {
          if (op.type === "add") {
            const [menuItem] = await tx
              .select()
              .from(menuItems)
              .where(eq(menuItems.id, op.menuItemId))
              .limit(1);
            if (!menuItem || menuItem.venueId !== existing.venueId) {
              throw new BadRequestError(
                "MENU_ITEM_NOT_IN_VENUE",
                "menuItemId does not belong to this order's venue",
              );
            }
            await tx.insert(orderItems).values({
              orderId: existing.id,
              menuItemId: menuItem.id,
              nameSnapshot: menuItem.name,
              unitPriceKopecksSnapshot: menuItem.unitPriceKopecks,
              quantity: op.quantity,
              comment: op.comment ?? null,
            });
          } else if (op.type === "update") {
            const [item] = await tx
              .select({ id: orderItems.id })
              .from(orderItems)
              .where(and(eq(orderItems.id, op.orderItemId), eq(orderItems.orderId, existing.id)))
              .limit(1);
            if (!item) {
              throw new NotFoundError("ORDER_ITEM_NOT_FOUND", "No order item matches this id");
            }
            await tx
              .update(orderItems)
              .set({
                ...(op.quantity !== undefined ? { quantity: op.quantity } : {}),
                ...(op.comment !== undefined ? { comment: op.comment } : {}),
              })
              .where(eq(orderItems.id, op.orderItemId));
          } else {
            const [item] = await tx
              .select({ id: orderItems.id })
              .from(orderItems)
              .where(and(eq(orderItems.id, op.orderItemId), eq(orderItems.orderId, existing.id)))
              .limit(1);
            if (!item) {
              throw new NotFoundError("ORDER_ITEM_NOT_FOUND", "No order item matches this id");
            }
            await tx.delete(orderItems).where(eq(orderItems.id, op.orderItemId));
          }
        }

        await tx
          .update(orders)
          .set({ version: existing.version + 1 })
          .where(eq(orders.id, existing.id));
      });

      return UpdateOrderResponseSchema.parse(await loadStaffOrder(existing.id));
    },
  );

  // POST /v1/staff/orders/:id/request-bill — open -> bill_requested.
  app.post<{ Params: { id: string } }>(
    "/v1/staff/orders/:id/request-bill",
    { preHandler: [requireAuth] },
    async (request) => {
      const { organizationId } = request.staff!;
      const body = RequestBillRequestSchema.parse(request.body);
      const existing = await getOrgOrderOrThrow(request.params.id, organizationId);
      assertVenueAccess(request.staff!, existing.venueId);

      if (existing.status !== "open") {
        throw new ConflictError(
          "INVALID_ORDER_TRANSITION",
          `Cannot request bill while status is "${existing.status}" (must be "open")`,
        );
      }
      if (body.version !== existing.version) {
        throw await versionConflict(existing.id);
      }

      await db
        .update(orders)
        .set({ status: "bill_requested", version: existing.version + 1 })
        .where(eq(orders.id, existing.id));

      return RequestBillResponseSchema.parse(await loadStaffOrder(existing.id));
    },
  );

  // POST /v1/staff/orders/:id/close
  app.post<{ Params: { id: string } }>(
    "/v1/staff/orders/:id/close",
    { preHandler: [requireAuth] },
    async (request) => {
      const { organizationId, staffId, role } = request.staff!;
      const body = CloseOrderRequestSchema.parse(request.body);
      const existing = await getOrgOrderOrThrow(request.params.id, organizationId);
      assertVenueAccess(request.staff!, existing.venueId);

      if (existing.status === "closed") {
        throw new ConflictError("ORDER_ALREADY_CLOSED", "Order is already closed");
      }
      if (body.version !== existing.version) {
        throw await versionConflict(existing.id);
      }

      const current = await loadStaffOrder(existing.id);
      const hasBalance = current.outstandingFoodKopecks > 0;

      if (hasBalance) {
        if (role === "waiter") {
          throw new ForbiddenError(
            "FORBIDDEN",
            "Waiters cannot close an order with an outstanding balance; a manager or owner must do it with a reason",
          );
        }
        if (!body.reason) {
          throw new BadRequestError(
            "CLOSE_REASON_REQUIRED",
            "reason is required to close an order with a nonzero outstanding balance",
          );
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ status: "closed", version: existing.version + 1 })
          .where(eq(orders.id, existing.id));

        if (hasBalance) {
          await recordAuditEvent(tx, {
            organizationId,
            actorStaffId: staffId,
            action: "order.closed_with_balance",
            entityType: "order",
            entityId: existing.id,
            before: { outstandingFoodKopecks: current.outstandingFoodKopecks },
            after: { reason: body.reason },
          });
        }
      });

      return CloseOrderResponseSchema.parse(await loadStaffOrder(existing.id));
    },
  );
}
