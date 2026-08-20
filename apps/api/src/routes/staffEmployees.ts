import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  CreateEmployeeRequestSchema,
  ListEmployeesResponseSchema,
  StaffEmployeeSchema,
  UpdateEmployeeRequestSchema,
  type StaffEmployee,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { staff } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgVenueOrThrow } from "../lib/scoping.js";
import { recordAuditEvent } from "../lib/audit.js";
import { ConflictError, NotFoundError } from "../middleware/errorHandler.js";
import { hashPassword, hashPin, verifyPin } from "../utils/password.js";

function toStaffEmployee(row: typeof staff.$inferSelect): StaffEmployee {
  return {
    id: row.id,
    organizationId: row.organizationId,
    venueId: row.venueId,
    name: row.name,
    role: row.role,
    email: row.email,
    hasPin: row.pinHash !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/**
 * Login by (venueId, pin) alone must uniquely identify a staff member (see
 * routes/staffAuth.ts), so a plaintext PIN can't collide with an existing
 * PIN hash at the same venue. Hashes are salted, so we can't compare them
 * directly — instead we verify the candidate PIN against every existing
 * hash at that venue.
 */
async function assertPinNotInUseAtVenue(venueId: string, pin: string, excludeStaffId?: string) {
  const rows = await db
    .select({ id: staff.id, pinHash: staff.pinHash })
    .from(staff)
    .where(and(eq(staff.venueId, venueId), isNotNull(staff.pinHash)));

  for (const row of rows) {
    if (excludeStaffId && row.id === excludeStaffId) continue;
    if (row.pinHash && (await verifyPin(row.pinHash, pin))) {
      throw new ConflictError("PIN_ALREADY_IN_USE", "This PIN is already in use at this venue");
    }
  }
}

/**
 * Staff management (POST/GET/PATCH /v1/staff/employees) — owner/manager
 * only. Creates manager/waiter rows scoped to organizationId (an `owner`
 * row is only ever created by POST /v1/owner/register). Staff created and
 * role changes are audited per the B1 task spec.
 */
export async function staffEmployeesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/staff/employees",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request, reply) => {
      const { organizationId, staffId } = request.staff!;
      const body = CreateEmployeeRequestSchema.parse(request.body);

      await getOrgVenueOrThrow(body.venueId, organizationId);

      if (body.role === "waiter" && body.pin) {
        await assertPinNotInUseAtVenue(body.venueId, body.pin);
      }

      const [passwordHash, pinHash] = await Promise.all([
        body.password ? hashPassword(body.password) : Promise.resolve(null),
        body.pin ? hashPin(body.pin) : Promise.resolve(null),
      ]);

      let row: typeof staff.$inferSelect;
      try {
        const result = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(staff)
            .values({
              organizationId,
              venueId: body.venueId,
              name: body.name,
              role: body.role,
              email: body.email ?? null,
              passwordHash,
              pinHash,
            })
            .returning();
          if (!inserted) throw new Error("Failed to create staff member");

          await recordAuditEvent(tx, {
            organizationId,
            actorStaffId: staffId,
            action: "staff.created",
            entityType: "staff",
            entityId: inserted.id,
            after: { name: inserted.name, role: inserted.role, venueId: inserted.venueId },
          });

          return inserted;
        });
        row = result;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("EMAIL_ALREADY_EXISTS", "This email is already in use in this organization");
        }
        throw error;
      }

      reply.status(201);
      return StaffEmployeeSchema.parse(toStaffEmployee(row));
    },
  );

  app.get(
    "/v1/staff/employees",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const rows = await db.select().from(staff).where(eq(staff.organizationId, organizationId));
      return ListEmployeesResponseSchema.parse({ employees: rows.map(toStaffEmployee) });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/staff/employees/:id",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId, staffId } = request.staff!;
      const body = UpdateEmployeeRequestSchema.parse(request.body);

      const [existing] = await db
        .select()
        .from(staff)
        .where(and(eq(staff.id, request.params.id), eq(staff.organizationId, organizationId)))
        .limit(1);
      if (!existing) {
        throw new NotFoundError("STAFF_NOT_FOUND", "No staff member matches this id");
      }
      if (existing.role === "owner") {
        throw new ConflictError("CANNOT_MODIFY_OWNER", "Owner accounts cannot be modified via this endpoint");
      }

      const targetVenueId = body.venueId ?? existing.venueId;
      if (body.venueId) {
        await getOrgVenueOrThrow(body.venueId, organizationId);
      }
      if (body.pin && targetVenueId) {
        await assertPinNotInUseAtVenue(targetVenueId, body.pin, existing.id);
      }

      const [newPasswordHash, newPinHash] = await Promise.all([
        body.password ? hashPassword(body.password) : Promise.resolve(undefined),
        body.pin ? hashPin(body.pin) : Promise.resolve(undefined),
      ]);

      const roleChanged = body.role !== undefined && body.role !== existing.role;

      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(staff)
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.role !== undefined ? { role: body.role } : {}),
            ...(body.venueId !== undefined ? { venueId: body.venueId } : {}),
            ...(newPasswordHash !== undefined ? { passwordHash: newPasswordHash } : {}),
            ...(newPinHash !== undefined ? { pinHash: newPinHash } : {}),
          })
          .where(eq(staff.id, existing.id))
          .returning();
        if (!updated) throw new Error("Failed to update staff member");

        if (roleChanged) {
          await recordAuditEvent(tx, {
            organizationId,
            actorStaffId: staffId,
            action: "staff.role_changed",
            entityType: "staff",
            entityId: existing.id,
            before: { role: existing.role },
            after: { role: updated.role },
          });
        }

        return updated;
      });

      return StaffEmployeeSchema.parse(toStaffEmployee(row));
    },
  );
}
