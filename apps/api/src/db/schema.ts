import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * B0 shipped the minimal schema (organizations/venues/floors/tables/
 * menu_items/orders/order_items) for the demo seed + public bill read
 * endpoint. B1 (this slice) adds the restaurant operating domain: staff
 * accounts/sessions/RBAC and an audit log — see docs/PRODUCT_SPEC_MVP.md
 * section 3/4 and docs/IMPLEMENTATION_PLANS.md "B1". Payment/tip/loyalty
 * tables remain out of scope (B2).
 */

export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "open",
  "bill_requested",
  "payment_pending",
  "partially_paid",
  "paid",
  "closed",
]);

export const orderItemPaymentStatusEnum = pgEnum("order_item_payment_status", [
  "unpaid",
  "partial",
  "paid",
]);

export const tableStatusEnum = pgEnum("table_status", [
  "free",
  "occupied",
  "paying",
  "paid",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    organizationIdIdx: index("venues_organization_id_idx").on(table.organizationId),
  }),
);

export const floors = pgTable(
  "floors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    venueIdIdx: index("floors_venue_id_idx").on(table.venueId),
  }),
);

export const tables = pgTable(
  "tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    floorId: uuid("floor_id")
      .notNull()
      .references(() => floors.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    qrToken: text("qr_token").notNull().unique(),
    status: tableStatusEnum("status").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    floorIdIdx: index("tables_floor_id_idx").on(table.floorId),
  }),
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unitPriceKopecks: integer("unit_price_kopecks").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    venueIdIdx: index("menu_items_venue_id_idx").on(table.venueId),
  }),
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    tableIdIdx: index("orders_table_id_idx").on(table.tableId),
    // Enforces "one non-closed order per table" at the DB level. The
    // application also checks-then-inserts inside a transaction for a clean
    // error message, but this partial unique index is what actually
    // prevents the race under concurrent inserts.
    oneActiveOrderPerTableIdx: uniqueIndex("orders_one_active_per_table_idx")
      .on(table.tableId)
      .where(sql`${table.status} <> 'closed'`),
  }),
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPriceKopecksSnapshot: integer("unit_price_kopecks_snapshot").notNull(),
    quantity: integer("quantity").notNull().default(1),
    comment: text("comment"),
    paymentStatus: orderItemPaymentStatusEnum("payment_status").notNull().default("unpaid"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdIdx: index("order_items_order_id_idx").on(table.orderId),
  }),
);

export const staffRoleEnum = pgEnum("staff_role", ["owner", "manager", "waiter"]);

/**
 * One person = one row. A waiter row has `pinHash` set and `passwordHash`
 * null; an owner/manager row has `passwordHash` set and `pinHash` null.
 * `venueId` is nullable because owner rows span every venue in the
 * organization (see docs/PRODUCT_SPEC_MVP.md section 2/5.1) — managers and
 * waiters are scoped to a single venue in this MVP.
 */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: staffRoleEnum("role").notNull(),
    email: text("email"),
    passwordHash: text("password_hash"),
    pinHash: text("pin_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    organizationIdIdx: index("staff_organization_id_idx").on(table.organizationId),
    venueIdIdx: index("staff_venue_id_idx").on(table.venueId),
    // Email is unique per organization when present (partial: many rows may
    // have a null email, e.g. waiters).
    orgEmailIdx: uniqueIndex("staff_org_email_idx")
      .on(table.organizationId, table.email)
      .where(sql`${table.email} is not null`),
  }),
);

/**
 * Immutable audit trail for critical writes: QR rotation, orders closed with
 * an outstanding balance, menu price changes, staff created/role changed.
 * `actorStaffId` is nullable for system-initiated actions (none exist yet in
 * B1, but the column keeps the model honest for later background jobs).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorStaffId: uuid("actor_staff_id").references(() => staff.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("audit_events_organization_id_idx").on(table.organizationId),
  }),
);
