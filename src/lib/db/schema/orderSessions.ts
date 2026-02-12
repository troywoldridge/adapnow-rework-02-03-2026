// src/lib/db/schema/orderSessions.ts
// Checkout session state - holds shipping, billing, totals before payment.

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

export const orderSessions = pgTable(
  "order_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: text("user_id"),

    productId: text("product_id").notNull(),

    options: jsonb("options").notNull().default(sql`'[]'::jsonb`),
    files: jsonb("files").notNull().default(sql`'[]'::jsonb`),

    shippingInfo: jsonb("shipping_info"),
    billingInfo: jsonb("billing_info"),

    currency: text("currency").notNull().default("USD"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),

    selectedShippingRate: jsonb("selected_shipping_rate"),

    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    sinaliteOrderId: text("sinalite_order_id"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderSessionsUserIdIdx: index("order_sessions_user_id_idx").on(t.userId),
    orderSessionsStripeCheckoutIdx: index("order_sessions_stripe_checkout_idx").on(
      t.stripeCheckoutSessionId
    ),
    orderSessionsStripePaymentIdx: index("order_sessions_stripe_payment_idx").on(
      t.stripePaymentIntentId
    ),
  })
);

export type OrderSessionRow = typeof orderSessions.$inferSelect;
export type OrderSessionInsert = typeof orderSessions.$inferInsert;
