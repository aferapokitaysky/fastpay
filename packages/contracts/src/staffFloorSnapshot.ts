import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";
import { StaffOrderStatusSchema } from "./staffOrders.js";

export const StaffFloorSnapshotOrderSchema = z.object({ id: z.string().uuid(), status: StaffOrderStatusSchema, version: z.number().int().nonnegative(), outstandingFoodKopecks: MoneyKopecksSchema, updatedAt: z.string().datetime() });
export const StaffFloorSnapshotTableSchema = z.object({ id: z.string().uuid(), label: z.string(), status: z.enum(["free", "occupied", "paying", "paid"]), activeOrder: StaffFloorSnapshotOrderSchema.nullable() });
export const StaffFloorSnapshotFloorSchema = z.object({ id: z.string().uuid(), name: z.string(), tables: z.array(StaffFloorSnapshotTableSchema) });
export const StaffFloorSnapshotResponseSchema = z.object({ floors: z.array(StaffFloorSnapshotFloorSchema) });
export type StaffFloorSnapshotResponse = z.infer<typeof StaffFloorSnapshotResponseSchema>;
