import { z } from "zod";

export const StaffTableSchema = z.object({
  id: z.string().uuid(),
  floorId: z.string().uuid(),
  label: z.string(),
  qrToken: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StaffTable = z.infer<typeof StaffTableSchema>;

/** POST /v1/staff/floors/:floorId/tables (owner/manager) */
export const CreateTableRequestSchema = z.object({
  label: z.string().min(1).max(50),
});
export type CreateTableRequest = z.infer<typeof CreateTableRequestSchema>;

/** PATCH /v1/staff/tables/:id (owner/manager) */
export const UpdateTableRequestSchema = z.object({
  label: z.string().min(1).max(50).optional(),
});
export type UpdateTableRequest = z.infer<typeof UpdateTableRequestSchema>;

export const ListTablesResponseSchema = z.object({
  tables: z.array(StaffTableSchema),
});
export type ListTablesResponse = z.infer<typeof ListTablesResponseSchema>;

/**
 * POST /v1/staff/tables/:id/rotate-qr (owner/manager)
 * Issues a new opaque qrToken and invalidates the old one immediately.
 * Writes an audit_events row (action: "table.qr_rotated").
 */
export const RotateQrResponseSchema = StaffTableSchema;
export type RotateQrResponse = z.infer<typeof RotateQrResponseSchema>;
