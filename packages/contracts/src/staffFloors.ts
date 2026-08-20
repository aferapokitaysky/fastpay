import { z } from "zod";

export const StaffFloorSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StaffFloor = z.infer<typeof StaffFloorSchema>;

/** POST /v1/staff/venues/:venueId/floors (owner/manager) */
export const CreateFloorRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateFloorRequest = z.infer<typeof CreateFloorRequestSchema>;

/** PATCH /v1/staff/floors/:id (owner/manager) */
export const UpdateFloorRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});
export type UpdateFloorRequest = z.infer<typeof UpdateFloorRequestSchema>;

export const ListFloorsResponseSchema = z.object({
  floors: z.array(StaffFloorSchema),
});
export type ListFloorsResponse = z.infer<typeof ListFloorsResponseSchema>;
