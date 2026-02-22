CREATE TABLE IF NOT EXISTS "guide_download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"href" text NOT NULL,
	"label" text,
	"category_path" text,
	"size_bytes" integer,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text NOT NULL,
	"phone" text,
	"product_type" text NOT NULL,
	"size" text,
	"colors" text,
	"material" text,
	"finishing" text,
	"quantity" text,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_order_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"quote_number" text NOT NULL,
	"po" text,
	"instructions" text,
	"expected_date" date,
	"shipping_option" text,
	"artwork_note" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_helpful_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"voter_fingerprint" varchar(64) NOT NULL,
	"user_id" varchar(128),
	"ip" varchar(64) NOT NULL,
	"is_helpful" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_artwork" DROP CONSTRAINT IF EXISTS "cart_artwork_cart_line_id_cart_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP CONSTRAINT IF EXISTS "customer_addresses_customer_id_customers_id_fk";
ALTER TABLE "customer_addresses" DROP CONSTRAINT IF EXISTS "customer_addresses_customer_id_fkey";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_customer_addresses_clerk";--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_customer_addresses_default_by_clerk";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email" SET DATA TYPE citext;--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "customer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "display_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_enc" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_last4" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "marketing_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "email" citext;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "phone_enc" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "phone_last4" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "is_default_shipping" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "is_default_billing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guide_download_events_created_at_idx" ON "guide_download_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_helpful_votes_review_fp_uq" ON "review_helpful_votes" USING btree ("review_id","voter_fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customers_created_at" ON "customers" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_customers_email_not_null" ON "customers" USING btree ("email") WHERE email is not null and deleted_at is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customer_addresses_created_at" ON "customer_addresses" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_provider_provider_id_uniq" ON "orders" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_cart_id_idx" ON "orders" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_sessions_created_at_idx" ON "order_sessions" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP COLUMN IF EXISTS "clerk_user_id";--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP COLUMN IF EXISTS "phone";--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP COLUMN IF EXISTS "is_default";