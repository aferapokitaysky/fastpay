import { z } from "zod";
import { StaffRoleSchema } from "./staffAuth.js";

export const StaffEmployeeSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  venueId: z.string().uuid().nullable(),
  name: z.string(),
  role: StaffRoleSchema,
  email: z.string().email().nullable(),
  hasPin: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StaffEmployee = z.infer<typeof StaffEmployeeSchema>;

/**
 * POST /v1/staff/employees (owner/manager)
 * Only creates manager/waiter rows — an `owner` row is only ever created by
 * POST /v1/owner/register. Manager requires email+password; waiter requires
 * pin. Both are scoped to a single venue in this MVP.
 */
export const CreateEmployeeRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
    role: z.enum(["manager", "waiter"]),
    venueId: z.string().uuid(),
    email: z.string().email().optional(),
    password: z.string().min(8).max(200).optional(),
    pin: z
      .string()
      .regex(/^\d{4,6}$/, "PIN must be 4-6 digits")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "manager" && (!value.email || !value.password)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manager requires email and password",
      });
    }
    if (value.role === "waiter" && !value.pin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "waiter requires pin",
      });
    }
  });
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;

/** PATCH /v1/staff/employees/:id (owner/manager) */
export const UpdateEmployeeRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["manager", "waiter"]).optional(),
  venueId: z.string().uuid().optional(),
  password: z.string().min(8).max(200).optional(),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits")
    .optional(),
});
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequestSchema>;

export const ListEmployeesResponseSchema = z.object({
  employees: z.array(StaffEmployeeSchema),
});
export type ListEmployeesResponse = z.infer<typeof ListEmployeesResponseSchema>;
