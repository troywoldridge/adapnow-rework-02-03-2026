CREATE TYPE "public"."currency_code" AS ENUM('USD', 'CAD');--> statement-breakpoint
CREATE TYPE "public"."loyalty_reason" AS ENUM('purchase', 'refund', 'adjustment', 'signup', 'promotion');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'submitted', 'paid', 'fulfilled', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE "artwork_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(48) NOT NULL,
	"order_id" varchar(48),
	"user_id" varchar(64),
	"file_url" varchar(255) NOT NULL,
	"file_name" varchar(128) NOT NULL,
	"file_size" integer,
	"file_type" varchar(64),
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sid" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"user_id" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"selected_shipping" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_artwork" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_line_id" uuid NOT NULL,
	"side" integer DEFAULT 1 NOT NULL,
	"label" text,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text DEFAULT 'artwork' NOT NULL,
	"content_type" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_line_id" uuid NOT NULL,
	"kind" text DEFAULT 'attachment' NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text DEFAULT 'attachment' NOT NULL,
	"content_type" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT 'credit' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"option_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"option_chain" text,
	"pricing_hash" text,
	"artwork" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"customer_id" uuid,
	"label" text,
	"first_name" text,
	"last_name" text,
	"company" text,
	"phone" text,
	"street1" text NOT NULL,
	"street2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" uuid,
	"delta" integer NOT NULL,
	"reason" "loyalty_reason" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_earned" integer DEFAULT 0 NOT NULL,
	"lifetime_redeemed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_number" text,
	"currency" char(3),
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"placed_at" timestamp with time zone,
	"provider" text,
	"provider_id" text,
	"customer_id" text,
	"billing_address_id" uuid,
	"shipping_address_id" uuid,
	"total" numeric,
	"cart_id" uuid,
	"payment_status" text DEFAULT 'paid',
	"credits_cents" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "price_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" integer,
	"store" text NOT NULL,
	"min_qty" integer NOT NULL,
	"max_qty" integer,
	"mult" numeric(6, 3) NOT NULL,
	"floor_pct" numeric(5, 3)
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" varchar(48) NOT NULL,
	"name" varchar(60) NOT NULL,
	"email" varchar(80),
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"approved" boolean DEFAULT false,
	"user_ip" varchar(45),
	"terms_agreed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"verified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "sinalite_product_metadata" (
	"product_id" integer NOT NULL,
	"store_code" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sinalite_product_metadata_product_id_store_code_pk" PRIMARY KEY("product_id","store_code")
);
--> statement-breakpoint
CREATE TABLE "sinalite_product_options" (
	"product_id" integer NOT NULL,
	"store_code" text NOT NULL,
	"option_id" integer NOT NULL,
	"option_group" text NOT NULL,
	"option_name" text NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sinalite_product_options_product_id_store_code_option_id_pk" PRIMARY KEY("product_id","store_code","option_id")
);
--> statement-breakpoint
CREATE TABLE "sinalite_product_pricing" (
	"product_id" integer NOT NULL,
	"store_code" text NOT NULL,
	"hash" text NOT NULL,
	"value" text NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sinalite_product_pricing_product_id_store_code_hash_pk" PRIMARY KEY("product_id","store_code","hash")
);
--> statement-breakpoint
CREATE TABLE "sinalite_products" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"sku" text,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sinalite_roll_label_content" (
	"product_id" integer NOT NULL,
	"store_code" text NOT NULL,
	"pricing_product_option_value_entity_id" integer NOT NULL,
	"content_type" text NOT NULL,
	"content" text,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sinalite_roll_label_content_product_id_store_code_pricing_product_option_value_entity_id_content_type_pk" PRIMARY KEY("product_id","store_code","pricing_product_option_value_entity_id","content_type")
);
--> statement-breakpoint
CREATE TABLE "sinalite_roll_label_exclusions" (
	"product_id" integer NOT NULL,
	"store_code" text NOT NULL,
	"exclusion_id" integer NOT NULL,
	"size_id" integer,
	"qty" integer,
	"pricing_product_option_entity_id_1" integer,
	"pricing_product_option_value_entity_id_1" integer,
	"pricing_product_option_entity_id_2" integer,
	"pricing_product_option_value_entity_id_2" integer,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sinalite_roll_label_exclusions_product_id_store_code_exclusion_id_pk" PRIMARY KEY("product_id","store_code","exclusion_id")
);
--> statement-breakpoint
CREATE TABLE "sinalite_roll_label_options" (
	"product_id" integer NOT NULL,
	"store_code" text NOT NULL,
	"option_id" integer NOT NULL,
	"opt_val_id" integer NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"option_val" text NOT NULL,
	"html_type" text,
	"opt_sort_order" integer,
	"opt_val_sort_order" integer,
	"img_src" text,
	"extra_turnaround_days" integer,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sinalite_roll_label_options_product_id_store_code_option_id_opt_val_id_pk" PRIMARY KEY("product_id","store_code","option_id","opt_val_id")
);
--> statement-breakpoint
CREATE TABLE "hero_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"slide_id" text NOT NULL,
	"cta_text" text,
	"page" text NOT NULL,
	"sid" text,
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_artwork" ADD CONSTRAINT "cart_artwork_cart_line_id_cart_lines_id_fk" FOREIGN KEY ("cart_line_id") REFERENCES "public"."cart_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_attachments" ADD CONSTRAINT "cart_attachments_cart_line_id_cart_lines_id_fk" FOREIGN KEY ("cart_line_id") REFERENCES "public"."cart_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_credits" ADD CONSTRAINT "cart_credits_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_wallet_id_loyalty_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."loyalty_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_uploads_product_idx" ON "artwork_uploads" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "artwork_uploads_order_idx" ON "artwork_uploads" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "artwork_uploads_user_idx" ON "artwork_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artwork_uploads_approved_idx" ON "artwork_uploads" USING btree ("approved");--> statement-breakpoint
CREATE INDEX "carts_sid_status_idx" ON "carts" USING btree ("sid","status");--> statement-breakpoint
CREATE INDEX "idx_carts_sid" ON "carts" USING btree ("sid");--> statement-breakpoint
CREATE INDEX "idx_carts_status" ON "carts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_carts_user" ON "carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cart_artwork_line_idx" ON "cart_artwork" USING btree ("cart_line_id");--> statement-breakpoint
CREATE INDEX "cart_attachments_line_idx" ON "cart_attachments" USING btree ("cart_line_id");--> statement-breakpoint
CREATE INDEX "cart_attachments_kind_idx" ON "cart_attachments" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "cart_credits_cart_idx" ON "cart_credits" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_credits_reason_idx" ON "cart_credits" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "cart_lines_cart_idx" ON "cart_lines" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_lines_product_idx" ON "cart_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "cart_lines_cart_product_idx" ON "cart_lines" USING btree ("cart_id","product_id");--> statement-breakpoint
CREATE INDEX "cart_lines_pricing_hash_idx" ON "cart_lines" USING btree ("pricing_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customers_clerk_user_id" ON "customers" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_customers_email" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_customer_addresses_clerk" ON "customer_addresses" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_customer_addresses_customer" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_customer_addresses_default_by_clerk" ON "customer_addresses" USING btree ("clerk_user_id") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "idx_txn_customer" ON "loyalty_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_txn_order" ON "loyalty_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_txn_wallet" ON "loyalty_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "idx_wallets_customer" ON "loyalty_wallets" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_loyalty_wallet_by_customer" ON "loyalty_wallets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_provider_provider_id_idx" ON "orders" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "reviews_approved_idx" ON "product_reviews" USING btree ("approved");--> statement-breakpoint
CREATE INDEX "reviews_created_at_idx" ON "product_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_product_id_idx" ON "product_reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reviews_rating_idx" ON "product_reviews" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "idx_sinalite_product_options_product" ON "sinalite_product_options" USING btree ("product_id","store_code");--> statement-breakpoint
CREATE INDEX "idx_sinalite_product_pricing_product" ON "sinalite_product_pricing" USING btree ("product_id","store_code");--> statement-breakpoint
CREATE INDEX "idx_sinalite_products_sku" ON "sinalite_products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "idx_sinalite_roll_label_content_product" ON "sinalite_roll_label_content" USING btree ("product_id","store_code");--> statement-breakpoint
CREATE INDEX "idx_sinalite_roll_label_exclusions_product" ON "sinalite_roll_label_exclusions" USING btree ("product_id","store_code");--> statement-breakpoint
CREATE INDEX "idx_sinalite_roll_label_options_product" ON "sinalite_roll_label_options" USING btree ("product_id","store_code");--> statement-breakpoint
CREATE INDEX "hero_events_created_at_idx" ON "hero_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hero_events_slide_id_idx" ON "hero_events" USING btree ("slide_id");--> statement-breakpoint
CREATE INDEX "hero_events_type_idx" ON "hero_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "hero_events_sid_idx" ON "hero_events" USING btree ("sid");