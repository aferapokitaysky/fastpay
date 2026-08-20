import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  CreateFloorRequestSchema,
  ListFloorsResponseSchema,
  StaffFloorSchema,
  UpdateFloorRequestSchema,
  type StaffFloor,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { floors } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgFloorOrThrow, getOrgVenueOrThrow } from "../lib/scoping.js";

function toStaffFloor(row: {
  id: string;
  venueId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): StaffFloor {
  return {
    id: row.id,
    venueId: row.venueId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Floors: create/list under a venue, update by id — owner/manager only. */
export async function staffFloorsRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { venueId: string } }>(
    "/v1/staff/venues/:venueId/floors",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request, reply) => {
      const { organizationId } = request.staff!;
      const body = CreateFloorRequestSchema.parse(request.body);
      const venue = await getOrgVenueOrThrow(request.params.venueId, organizationId);

      const [row] = await db.insert(floors).values({ venueId: venue.id, name: body.name }).returning();
      if (!row) throw new Error("Failed to create floor");

      reply.status(201);
      return StaffFloorSchema.parse(toStaffFloor(row));
    },
  );

  app.get<{ Params: { venueId: string } }>(
    "/v1/staff/venues/:venueId/floors",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const venue = await getOrgVenueOrThrow(request.params.venueId, organizationId);
      const rows = await db.select().from(floors).where(eq(floors.venueId, venue.id));
      return ListFloorsResponseSchema.parse({ floors: rows.map(toStaffFloor) });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/staff/floors/:id",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const body = UpdateFloorRequestSchema.parse(request.body);
      await getOrgFloorOrThrow(request.params.id, organizationId);

      const [row] = await db
        .update(floors)
        .set({ ...(body.name !== undefined ? { name: body.name } : {}) })
        .where(eq(floors.id, request.params.id))
        .returning();
      if (!row) throw new Error("Failed to update floor");

      return StaffFloorSchema.parse(toStaffFloor(row));
    },
  );
}
