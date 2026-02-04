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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: text("user_id").notNull(),

    status: text("status").notNull().default("draft"),

    // ✅ v2: timestamptz + not null
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

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
    ordersCustomerIdIdx: index("orders_customer_id_idx").on(t.customerId),
    ordersProviderProviderIdIdx: index("orders_provider_provider_id_idx").on(
      t.provider,
      t.providerId
    ),
  })
);
