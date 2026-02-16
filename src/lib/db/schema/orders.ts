// src/lib/db/schema/orders.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  char,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: text("user_id").notNull(),

    status: text("status").notNull().default("draft"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    orderNumber: text("order_number"),

    currency: char("currency", { length: 3 }),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    placedAt: timestamp("placed_at", { withTimezone: true }),

    provider: text("provider"),
    providerId: text("provider_id"),

    customerId: text("customer_id"),

    billingAddressId: uuid("billing_address_id"),
    shippingAddressId: uuid("shipping_address_id"),

    total: numeric("total"),

    cartId: uuid("cart_id"),

    paymentStatus: text("payment_status").default("paid"),

    creditsCents: integer("credits_cents").default(0),
  },
  (t) => ({
    // Existing
    ordersCustomerIdIdx: index("orders_customer_id_idx").on(t.customerId),
    ordersProviderProviderIdIdx: index("orders_provider_provider_id_idx").on(t.provider, t.providerId),

    // ✅ NEW: Idempotency hard stop
    ordersProviderProviderIdUnique: uniqueIndex("orders_provider_provider_id_uniq").on(t.provider, t.providerId),

    // ✅ Helpful lookups
    ordersCartIdx: index("orders_cart_id_idx").on(t.cartId),
    ordersUserIdx: index("orders_user_id_idx").on(t.userId),
    ordersCreatedIdx: index("orders_created_at_idx").on(t.createdAt),
  })
);

export type OrderRow = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
