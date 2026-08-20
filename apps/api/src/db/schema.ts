import {
  type AnyPgColumn,
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
 * endpoint. B1 added the restaurant operating domain: staff
 * accounts/sessions/RBAC and an audit log — see docs/PRODUCT_SPEC_MVP.md
 * section 3/4 and docs/IMPLEMENTATION_PLANS.md "B1". B2 (this slice) adds the
 * payment domain: payment_intents/payment_intent_items/payment_events,
 * per-venue payment provider config, and a reservation mechanism bolted onto
 * order_items — see docs/IMPLEMENTATION_PLANS.md "B2" and
 * apps/api/src/payments/*. Loyalty/CRM tables remain out of scope (B3+).
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

/**
 * PaymentIntent lifecycle, per docs/PRODUCT_SPEC_MVP.md section 4:
 *   created -> provider_pending -> succeeded | failed | expired | cancelled
 * `review_required` is a B2 addition (not in the section-4 diagram, which
 * predates the payment domain): a webhook whose amount doesn't match the
 * intent's total is never silently accepted (section 7) — it lands here
 * instead of `succeeded`, and no order_items are marked paid.
 */
export const paymentIntentStatusEnum = pgEnum("payment_intent_status", [
  "created",
  "provider_pending",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
  "review_required",
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
    // B3: who opened this order — nullable because it didn't exist before
    // this migration (orders created earlier have no attribution) and
    // because "system" opens aren't modeled. Set once at creation time
    // (routes/staffOrders.ts) from the authenticated session; never
    // reassigned. This is what makes per-staff analytics
    // (routes/staffAnalytics.ts) possible at all — there was no way to
    // attribute an order to a staff member before this column existed.
    openedByStaffId: uuid("opened_by_staff_id").references((): AnyPgColumn => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    tableIdIdx: index("orders_table_id_idx").on(table.tableId),
    openedByStaffIdIdx: index("orders_opened_by_staff_id_idx").on(table.openedByStaffId),
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
    // Reservation mechanism (B2) — see apps/api/src/payments/reservation.ts.
    // Set together, inside the payment-intent-creation transaction, while a
    // PaymentIntent holds this item; cleared (both to null) the moment that
    // intent resolves (succeeded/failed/expired/cancelled) so the item
    // becomes payable again immediately rather than waiting out the TTL.
    // `reservedUntil < now()` is treated as "not reserved" even if the
    // columns haven't been cleared yet (lazy expiry — see B2 task notes).
    reservedByPaymentIntentId: uuid("reserved_by_payment_intent_id").references(
      (): AnyPgColumn => paymentIntents.id,
      { onDelete: "set null" },
    ),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdIdx: index("order_items_order_id_idx").on(table.orderId),
    reservedByPaymentIntentIdIdx: index("order_items_reserved_by_payment_intent_id_idx").on(
      table.reservedByPaymentIntentId,
    ),
  }),
);

/**
 * Payment domain (B2) — see docs/PRODUCT_SPEC_MVP.md sections 4/5.3/5.4/7,
 * docs/IMPLEMENTATION_PLANS.md "B2", and apps/api/src/payments/*.
 *
 * `payment_intents`: one row per checkout attempt. `idempotencyKey` is
 * client-supplied and globally unique — a double-tap "Оплатити" that
 * resubmits the same key returns the existing intent (200) instead of
 * creating a second one (see routes/publicPaymentIntents.ts).
 *
 * `payment_intent_items`: which order_items a given intent covers, and the
 * amount reserved for each at reservation time (the item's full remaining
 * line total — no partial-item-amount splitting in this MVP, see B2 task
 * notes / PRODUCT_SPEC_MVP.md 5.4).
 *
 * `payment_events`: one row per webhook delivery. `providerEventId` is
 * unique — this is what makes webhook processing idempotent: a duplicate
 * delivery hits the unique constraint and is a no-op (see
 * routes/webhooks.ts). `rawPayload` must never contain card numbers/CVV —
 * the fake provider's payloads are safe by construction; a real provider
 * adapter would need to sanitize before writing here.
 *
 * `venue_payment_configs`: one row per venue (unique `venueId`), storing the
 * AES-256-GCM-encrypted provider credentials — see utils/crypto.ts and
 * routes/staffPaymentConfig.ts. The decrypted credential string is never
 * returned in any API response.
 */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: paymentIntentStatusEnum("status").notNull().default("created"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    amountFoodKopecks: integer("amount_food_kopecks").notNull(),
    amountTipKopecks: integer("amount_tip_kopecks").notNull(),
    currency: text("currency").notNull(),
    provider: text("provider").notNull(),
    providerInvoiceId: text("provider_invoice_id"),
    checkoutUrl: text("checkout_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdIdx: index("payment_intents_order_id_idx").on(table.orderId),
    idempotencyKeyIdx: index("payment_intents_idempotency_key_idx").on(table.idempotencyKey),
    providerInvoiceIdIdx: index("payment_intents_provider_invoice_id_idx").on(
      table.providerInvoiceId,
    ),
  }),
);

export const paymentIntentItems = pgTable(
  "payment_intent_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentIntentId: uuid("payment_intent_id")
      .notNull()
      .references(() => paymentIntents.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    amountKopecks: integer("amount_kopecks").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    paymentIntentIdIdx: index("payment_intent_items_payment_intent_id_idx").on(
      table.paymentIntentId,
    ),
    orderItemIdIdx: index("payment_intent_items_order_item_id_idx").on(table.orderItemId),
  }),
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull().unique(),
    rawPayload: jsonb("raw_payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => ({
    paymentIntentIdIdx: index("payment_events_payment_intent_id_idx").on(table.paymentIntentId),
  }),
);

export const venuePaymentConfigs = pgTable(
  "venue_payment_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .unique()
      .references(() => venues.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    configuredAt: timestamp("configured_at", { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (table) => ({
    venueIdIdx: index("venue_payment_configs_venue_id_idx").on(table.venueId),
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

/**
 * B3 realtime outbox — see apps/api/src/realtime/*. Written transactionally
 * alongside the state change it describes (order request-bill, payment
 * started/succeeded/failed, order item mutations), matching the payment
 * domain's idempotent-side-effect discipline. `status` is durable,
 * team-shared read-state (not per-browser-tab): `pending` -> `seen` ->
 * `resolved`/`archived`, mutated by the client commands defined in
 * packages/contracts/src/staffRealtime.ts (`StaffRealtimeCommandSchema`).
 * A `pending` row survives regardless of whether any staff device is
 * currently connected — a reconnecting WebSocket client is caught up by
 * querying rows here, which is what makes this durable without a separate
 * delivery-retry/DLQ table (see realtime/pubsub.ts doc comment for the
 * full reasoning).
 */
export const realtimeEventTypeEnum = pgEnum("realtime_event_type", [
  "bill_requested",
  "payment_started",
  "payment_succeeded",
  "payment_failed",
  "order_updated",
  "table_attention",
]);

export const realtimeEventStatusEnum = pgEnum("realtime_event_status", [
  "pending",
  "seen",
  "resolved",
  "archived",
]);

export const realtimeEvents = pgTable(
  "realtime_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    type: realtimeEventTypeEnum("type").notNull(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references((): AnyPgColumn => orders.id, { onDelete: "set null" }),
    // Holds the rest of the StaffRealtimeEvent contract fields (amountKopecks,
    // tipKopecks, title, body, action) exactly shaped so a row round-trips
    // straight into a response — see realtime/events.ts.
    payload: jsonb("payload").notNull(),
    status: realtimeEventStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    venueIdIdx: index("realtime_events_venue_id_idx").on(table.venueId),
    // Catch-up query on WebSocket (re)connect: venue + not-yet-resolved, newest first.
    venueStatusIdx: index("realtime_events_venue_status_idx").on(table.venueId, table.status),
  }),
);

/**
 * B3 guest loyalty — voluntary, phone-only opt-in offered on the post-payment
 * "thank you" screen (docs/PRODUCT_SPEC_MVP.md section 10). `phoneHash` is
 * HMAC-SHA256(phone, GUEST_PHONE_HASH_PEPPER) — one-way, not reversible
 * encryption like venue_payment_configs: we only ever need to recognize a
 * RETURNING phone, never display the plaintext back. Unique per organization
 * (a guest's loyalty history is scoped to the restaurant group, not global).
 */
export const guestProfiles = pgTable(
  "guest_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    phoneHash: text("phone_hash").notNull(),
    visitCount: integer("visit_count").notNull().default(1),
    totalSpentKopecks: integer("total_spent_kopecks").notNull().default(0),
    firstVisitAt: timestamp("first_visit_at", { withTimezone: true }).notNull().defaultNow(),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgPhoneHashIdx: uniqueIndex("guest_profiles_org_phone_hash_idx").on(
      table.organizationId,
      table.phoneHash,
    ),
  }),
);
