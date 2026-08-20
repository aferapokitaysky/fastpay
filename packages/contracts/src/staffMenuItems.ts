import { z } from "zod";
import { MoneyKopecksSchema } from "./money.js";

export const StaffMenuItemSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  name: z.string(),
  unitPriceKopecks: MoneyKopecksSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type StaffMenuItem = z.infer<typeof StaffMenuItemSchema>;

/** POST /v1/staff/venues/:venueId/menu-items (owner/manager) */
export const CreateMenuItemRequestSchema = z.object({
  name: z.string().min(1).max(200),
  unitPriceKopecks: MoneyKopecksSchema,
});
export type CreateMenuItemRequest = z.infer<typeof CreateMenuItemRequestSchema>;

/**
 * PATCH /v1/staff/menu-items/:id (owner/manager)
 * Changing unitPriceKopecks never retroactively touches
 * order_items.unit_price_kopecks_snapshot on existing orders (see
 * docs/PRODUCT_SPEC_MVP.md section 7). A price change writes an
 * audit_events row (action: "menu_item.price_changed").
 */
export const UpdateMenuItemRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unitPriceKopecks: MoneyKopecksSchema.optional(),
});
export type UpdateMenuItemRequest = z.infer<typeof UpdateMenuItemRequestSchema>;

export const ListMenuItemsResponseSchema = z.object({
  menuItems: z.array(StaffMenuItemSchema),
});
export type ListMenuItemsResponse = z.infer<typeof ListMenuItemsResponseSchema>;
