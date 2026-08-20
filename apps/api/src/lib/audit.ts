import { auditEvents } from "../db/schema.js";
import { db } from "../db/client.js";

/** Both Drizzle's database and transaction expose `insert`; keeping the
 * boundary this small makes audit writes type-safe across Drizzle upgrades. */
type DbOrTx = Pick<typeof db, "insert">;

export interface AuditEventInput {
  organizationId: string;
  actorStaffId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes one audit_events row. Pass the transaction handle (`tx`) when
 * called from inside a `db.transaction(...)` block so the audit row commits
 * atomically with the write it documents — see routes/staffTables.ts
 * (QR rotation), routes/staffMenuItems.ts (price changes), and
 * routes/staffOrders.ts (close-with-balance) for the call sites required by
 * the B1 task spec.
 */
export async function recordAuditEvent(tx: DbOrTx, input: AuditEventInput): Promise<void> {
  await tx.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorStaffId: input.actorStaffId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
