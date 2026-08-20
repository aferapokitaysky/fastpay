DO $$ BEGIN
 CREATE TYPE "public"."realtime_event_status" AS ENUM('pending', 'seen', 'resolved', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."realtime_event_type" AS ENUM('bill_requested', 'payment_started', 'payment_succeeded', 'payment_failed', 'order_updated', 'table_attention');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guest_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phone_hash" text NOT NULL,
	"visit_count" integer DEFAULT 1 NOT NULL,
	"total_spent_kopecks" integer DEFAULT 0 NOT NULL,
	"first_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_visit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "realtime_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"type" "realtime_event_type" NOT NULL,
	"table_id" uuid NOT NULL,
	"order_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "realtime_event_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "opened_by_staff_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realtime_events" ADD CONSTRAINT "realtime_events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realtime_events" ADD CONSTRAINT "realtime_events_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "realtime_events" ADD CONSTRAINT "realtime_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guest_profiles_org_phone_hash_idx" ON "guest_profiles" USING btree ("organization_id","phone_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realtime_events_venue_id_idx" ON "realtime_events" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realtime_events_venue_status_idx" ON "realtime_events" USING btree ("venue_id","status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_opened_by_staff_id_staff_id_fk" FOREIGN KEY ("opened_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_opened_by_staff_id_idx" ON "orders" USING btree ("opened_by_staff_id");