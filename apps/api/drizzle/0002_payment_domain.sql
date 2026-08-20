DO $$ BEGIN
 CREATE TYPE "public"."payment_intent_status" AS ENUM('created', 'provider_pending', 'succeeded', 'failed', 'expired', 'cancelled', 'review_required');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_intent_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"amount_kopecks" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "payment_intent_status" DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_food_kopecks" integer NOT NULL,
	"amount_tip_kopecks" integer NOT NULL,
	"currency" text NOT NULL,
	"provider" text NOT NULL,
	"provider_invoice_id" text,
	"checkout_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "venue_payment_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"configured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	CONSTRAINT "venue_payment_configs_venue_id_unique" UNIQUE("venue_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "reserved_by_payment_intent_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "reserved_until" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_intent_items" ADD CONSTRAINT "payment_intent_items_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_intent_items" ADD CONSTRAINT "payment_intent_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "venue_payment_configs" ADD CONSTRAINT "venue_payment_configs_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_events_payment_intent_id_idx" ON "payment_events" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intent_items_payment_intent_id_idx" ON "payment_intent_items" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intent_items_order_item_id_idx" ON "payment_intent_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_order_id_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_idempotency_key_idx" ON "payment_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intents_provider_invoice_id_idx" ON "payment_intents" USING btree ("provider_invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_payment_configs_venue_id_idx" ON "venue_payment_configs" USING btree ("venue_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_reserved_by_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("reserved_by_payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_reserved_by_payment_intent_id_idx" ON "order_items" USING btree ("reserved_by_payment_intent_id");