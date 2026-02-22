// src/lib/db/schema/orderSessions.ts
// Checkout session state - holds shipping, billing, files, options, and totals before payment.
// Designed for "draft checkout" flows, Stripe handoff, and post-checkout reconciliation.
import {
  pgTable,
  uuid,
  text,
  jsonb,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Notes:
 * - money fields are numeric(12,2) so DB always enforces 2-decimal money storage.
 * - options/files/shipping/billing are jsonb because payloads evolve.
 * - currency is text for now; we keep it constrained to common values at the app layer.
 *   If you want DB-level enforcement later, we can add a CHECK in SQL migration.
 */

export const orderSessions = pgTable(
  "order_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // Optional identity mapping. For Clerk-based systems you may switch to clerk_user_id later,
    // but keeping this as a generic user/session identifier is fine for a draft session table.
    userId: text("user_id"),

    // Draft session is tied to a single product (your current flow)
    productId: text("product_id").notNull(),

    // Flexible payloads
    options: jsonb("options").notNull().default(sql`'[]'::jsonb`),
    files: jsonb("files").notNull().default(sql`'[]'::jsonb`),

    shippingInfo: jsonb("shipping_info"),
    billingInfo: jsonb("billing_info"),

    // Prefer "USD"/"CAD" but keep it open-ended for future expansion.
    currency: text("currency").notNull().default("USD"),

    // Money (numeric is the correct long-term move)
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),

    // Expected shape: [carrier, service, price, available]
    selectedShippingRate: jsonb("selected_shipping_rate"),

    // Stripe/Sinalite linkage
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    sinaliteOrderId: text("sinalite_order_id"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Basic lookup
    orderSessionsUserIdIdx: index("order_sessions_user_id_idx").on(t.userId),

    // Stripe lookups (used after redirect)
    orderSessionsStripeCheckoutIdx: index("order_sessions_stripe_checkout_idx").on(
      t.stripeCheckoutSessionId,
    ),
    orderSessionsStripePaymentIdx: index("order_sessions_stripe_payment_idx").on(
      t.stripePaymentIntentId,
    ),

    // Helpful for dashboards/cleanup jobs (recent sessions)
    orderSessionsCreatedAtIdx: index("order_sessions_created_at_idx").on(t.createdAt),
  }),
);

export type OrderSessionRow = typeof orderSessions.$inferSelect;
export type OrderSessionInsert = typeof orderSessions.$inferInsert;
