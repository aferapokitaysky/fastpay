import "../config/env.js";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import {
  floors,
  menuItems,
  orderItems,
  orders,
  organizations,
  staff,
  tables,
  venues,
} from "./schema.js";
import { generateOpaqueToken } from "../utils/opaqueToken.js";
import { hashPassword, hashPin } from "../utils/password.js";

const DEMO_ORG_NAME = "Goodman Demo";
const DEMO_VENUE_NAME = "Goodman";
const DEMO_FLOOR_NAME = "Main Hall";
const DEMO_TABLE_LABEL = "02";
const DEMO_OWNER_EMAIL = "owner@goodman-demo.fastpay.ua";
const DEMO_OWNER_PASSWORD = "demo-owner-pass-123";
const DEMO_WAITER_NAME = "Demo Waiter";
const DEMO_WAITER_PIN = "1234";

function generateQrToken(): string {
  return generateOpaqueToken(24);
}

export interface SeedResult {
  organizationId: string;
  venueId: string;
  tableId: string;
  qrToken: string;
  orderId: string;
  ownerStaffId: string;
  ownerEmail: string;
  ownerPassword: string;
  waiterStaffId: string;
  waiterPin: string;
}

/**
 * Idempotent-ish: deletes any previously seeded demo org (cascades through
 * venues/floors/tables/orders/order_items/menu_items via FKs) before
 * re-creating it, so re-running this script (or a test suite) is safe.
 */
export async function seedDemoData(): Promise<SeedResult> {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, DEMO_ORG_NAME));

  for (const org of existing) {
    await db.delete(organizations).where(eq(organizations.id, org.id));
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: DEMO_ORG_NAME })
    .returning({ id: organizations.id });
  if (!org) throw new Error("Failed to seed organization");

  const [venue] = await db
    .insert(venues)
    .values({ organizationId: org.id, name: DEMO_VENUE_NAME, logoUrl: null })
    .returning({ id: venues.id });
  if (!venue) throw new Error("Failed to seed venue");

  const [floor] = await db
    .insert(floors)
    .values({ venueId: venue.id, name: DEMO_FLOOR_NAME })
    .returning({ id: floors.id });
  if (!floor) throw new Error("Failed to seed floor");

  const qrToken = generateQrToken();

  const [table] = await db
    .insert(tables)
    .values({
      floorId: floor.id,
      label: DEMO_TABLE_LABEL,
      qrToken,
      status: "occupied",
    })
    .returning({ id: tables.id });
  if (!table) throw new Error("Failed to seed table");

  const menuItemRows = await db
    .insert(menuItems)
    .values([
      { venueId: venue.id, name: "Бургер", unitPriceKopecks: 32000 },
      { venueId: venue.id, name: "Картопля фрі", unitPriceKopecks: 9000 },
      { venueId: venue.id, name: "Лимонад", unitPriceKopecks: 6500 },
      { venueId: venue.id, name: "Цезар з куркою", unitPriceKopecks: 21000 },
    ])
    .returning({ id: menuItems.id, name: menuItems.name, unitPriceKopecks: menuItems.unitPriceKopecks });

  const [burger, fries, lemonade] = menuItemRows;
  if (!burger || !fries || !lemonade) throw new Error("Failed to seed menu items");

  const [order] = await db
    .insert(orders)
    .values({ tableId: table.id, status: "bill_requested", version: 1 })
    .returning({ id: orders.id });
  if (!order) throw new Error("Failed to seed order");

  await db.insert(orderItems).values([
    {
      orderId: order.id,
      menuItemId: burger.id,
      nameSnapshot: burger.name,
      unitPriceKopecksSnapshot: burger.unitPriceKopecks,
      quantity: 1,
      paymentStatus: "unpaid",
    },
    {
      orderId: order.id,
      menuItemId: fries.id,
      nameSnapshot: fries.name,
      unitPriceKopecksSnapshot: fries.unitPriceKopecks,
      quantity: 2,
      paymentStatus: "unpaid",
    },
    {
      orderId: order.id,
      menuItemId: lemonade.id,
      nameSnapshot: lemonade.name,
      unitPriceKopecksSnapshot: lemonade.unitPriceKopecks,
      quantity: 1,
      paymentStatus: "unpaid",
    },
  ]);

  const [ownerPasswordHash, waiterPinHash] = await Promise.all([
    hashPassword(DEMO_OWNER_PASSWORD),
    hashPin(DEMO_WAITER_PIN),
  ]);

  const [owner] = await db
    .insert(staff)
    .values({
      organizationId: org.id,
      venueId: null,
      name: "Demo Owner",
      role: "owner",
      email: DEMO_OWNER_EMAIL,
      passwordHash: ownerPasswordHash,
    })
    .returning({ id: staff.id });
  if (!owner) throw new Error("Failed to seed owner");

  const [waiter] = await db
    .insert(staff)
    .values({
      organizationId: org.id,
      venueId: venue.id,
      name: DEMO_WAITER_NAME,
      role: "waiter",
      pinHash: waiterPinHash,
    })
    .returning({ id: staff.id });
  if (!waiter) throw new Error("Failed to seed waiter");

  // eslint-disable-next-line no-console
  console.log("Seeded demo data.");
  // eslint-disable-next-line no-console
  console.log(`  Table label:    ${DEMO_TABLE_LABEL}`);
  // eslint-disable-next-line no-console
  console.log(`  QR token:       ${qrToken}`);
  // eslint-disable-next-line no-console
  console.log(`  Bill URL:       /v1/public/tables/${qrToken}/bill`);
  // eslint-disable-next-line no-console
  console.log(`  Owner email:    ${DEMO_OWNER_EMAIL}`);
  // eslint-disable-next-line no-console
  console.log(`  Owner password: ${DEMO_OWNER_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`  Venue id:       ${venue.id}`);
  // eslint-disable-next-line no-console
  console.log(`  Waiter PIN:     ${DEMO_WAITER_PIN} (login with venueId above)`);

  return {
    organizationId: org.id,
    venueId: venue.id,
    tableId: table.id,
    qrToken,
    orderId: order.id,
    ownerStaffId: owner.id,
    ownerEmail: DEMO_OWNER_EMAIL,
    ownerPassword: DEMO_OWNER_PASSWORD,
    waiterStaffId: waiter.id,
    waiterPin: DEMO_WAITER_PIN,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  seedDemoData()
    .then(async () => {
      await pool.end();
    })
    .catch(async (error) => {
      // eslint-disable-next-line no-console
      console.error("Seed failed:", error);
      await pool.end();
      process.exit(1);
    });
}
