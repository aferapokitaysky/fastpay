import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  CreateTableRequestSchema,
  ListTablesResponseSchema,
  RotateQrResponseSchema,
  StaffTableSchema,
  UpdateTableRequestSchema,
  type StaffTable,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { tables } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgFloorOrThrow, getOrgTableOrThrow } from "../lib/scoping.js";
import { recordAuditEvent } from "../lib/audit.js";
import { generateOpaqueToken } from "../utils/opaqueToken.js";

function toStaffTable(row: {
  id: string;
  floorId: string;
  label: string;
  qrToken: string;
  createdAt: Date;
  updatedAt: Date;
}): StaffTable {
  return {
    id: row.id,
    floorId: row.floorId,
    label: row.label,
    qrToken: row.qrToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Tables: create/list under a floor, update label, and rotate-qr — owner/
 * manager only. qrToken generation reuses the same opaque-token util as
 * seed.ts (extracted from what was inline B0 seed logic).
 */
export async function staffTablesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { floorId: string } }>(
    "/v1/staff/floors/:floorId/tables",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request, reply) => {
      const { organizationId } = request.staff!;
      const body = CreateTableRequestSchema.parse(request.body);
      const floor = await getOrgFloorOrThrow(request.params.floorId, organizationId);

      const [row] = await db
        .insert(tables)
        .values({ floorId: floor.id, label: body.label, qrToken: generateOpaqueToken() })
        .returning();
      if (!row) throw new Error("Failed to create table");

      reply.status(201);
      return StaffTableSchema.parse(toStaffTable(row));
    },
  );

  app.get<{ Params: { floorId: string } }>(
    "/v1/staff/floors/:floorId/tables",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const floor = await getOrgFloorOrThrow(request.params.floorId, organizationId);
      const rows = await db.select().from(tables).where(eq(tables.floorId, floor.id));
      return ListTablesResponseSchema.parse({ tables: rows.map(toStaffTable) });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/staff/tables/:id",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const body = UpdateTableRequestSchema.parse(request.body);
      await getOrgTableOrThrow(request.params.id, organizationId);

      const [row] = await db
        .update(tables)
        .set({ ...(body.label !== undefined ? { label: body.label } : {}) })
        .where(eq(tables.id, request.params.id))
        .returning();
      if (!row) throw new Error("Failed to update table");

      return StaffTableSchema.parse(toStaffTable(row));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/staff/tables/:id/rotate-qr",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId, staffId } = request.staff!;
      const existing = await getOrgTableOrThrow(request.params.id, organizationId);
      const newToken = generateOpaqueToken();

      const row = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tables)
          .set({ qrToken: newToken })
          .where(eq(tables.id, existing.id))
          .returning();
        if (!updated) throw new Error("Failed to rotate QR token");

        await recordAuditEvent(tx, {
          organizationId,
          actorStaffId: staffId,
          action: "table.qr_rotated",
          entityType: "table",
          entityId: existing.id,
          before: { qrToken: existing.qrToken },
          after: { qrToken: newToken },
        });

        return updated;
      });

      return RotateQrResponseSchema.parse(toStaffTable(row));
    },
  );
}
