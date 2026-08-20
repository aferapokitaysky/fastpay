import { z } from "zod";

export const StaffVenueSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  logoUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StaffVenue = z.infer<typeof StaffVenueSchema>;

/** POST /v1/staff/venues (owner/manager) */
export const CreateVenueRequestSchema = z.object({
  name: z.string().min(1).max(200),
  logoUrl: z.string().url().nullable().optional(),
});
export type CreateVenueRequest = z.infer<typeof CreateVenueRequestSchema>;

/** PATCH /v1/staff/venues/:id (owner/manager) */
export const UpdateVenueRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  logoUrl: z.string().url().nullable().optional(),
});
export type UpdateVenueRequest = z.infer<typeof UpdateVenueRequestSchema>;

export const ListVenuesResponseSchema = z.object({
  venues: z.array(StaffVenueSchema),
});
export type ListVenuesResponse = z.infer<typeof ListVenuesResponseSchema>;
