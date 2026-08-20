import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  CreateVenueRequestSchema,
  ListVenuesResponseSchema,
  StaffVenueSchema,
  UpdateVenueRequestSchema,
  type StaffVenue,
} from "@fastpay/contracts";
import { db } from "../db/client.js";
import { venues } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getOrgVenueOrThrow } from "../lib/scoping.js";

function toStaffVenue(row: typeof venues.$inferSelect): StaffVenue {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    logoUrl: row.logoUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Venues: create/list/get/update — owner/manager only, scoped to organizationId. */
export async function staffVenuesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/staff/venues",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request, reply) => {
      const body = CreateVenueRequestSchema.parse(request.body);
      const { organizationId } = request.staff!;

      const [row] = await db
        .insert(venues)
        .values({ organizationId, name: body.name, logoUrl: body.logoUrl ?? null })
        .returning();
      if (!row) throw new Error("Failed to create venue");

      reply.status(201);
      return StaffVenueSchema.parse(toStaffVenue(row));
    },
  );

  app.get(
    "/v1/staff/venues",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const rows = await db.select().from(venues).where(eq(venues.organizationId, organizationId));
      return ListVenuesResponseSchema.parse({ venues: rows.map(toStaffVenue) });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/staff/venues/:id",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const row = await getOrgVenueOrThrow(request.params.id, organizationId);
      return StaffVenueSchema.parse(toStaffVenue(row));
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/staff/venues/:id",
    { preHandler: [requireAuth, requireRole("owner", "manager")] },
    async (request) => {
      const { organizationId } = request.staff!;
      const body = UpdateVenueRequestSchema.parse(request.body);
      await getOrgVenueOrThrow(request.params.id, organizationId);

      const [row] = await db
        .update(venues)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
        })
        .where(eq(venues.id, request.params.id))
        .returning();
      if (!row) throw new Error("Failed to update venue");

      return StaffVenueSchema.parse(toStaffVenue(row));
    },
  );
}
