// src/lib/db/schema/orderItems.ts
// Order line items - one row per product in an order.

import { pgTable, uuid, text, integer, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./orders";

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),

    productId: integer("product_id").notNull(),

    quantity: integer("quantity").notNull().default(1),

    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull().default(0),

    optionIds: jsonb("option_ids").notNull().default(sql`'[]'::jsonb`),
  },
  (t) => ({
    orderItemsOrderIdx: index("order_items_order_idx").on(t.orderId),
    orderItemsProductIdx: index("order_items_product_idx").on(t.productId),
  })
);

export type OrderItemRow = typeof orderItems.$inferSelect;
export type OrderItemInsert = typeof orderItems.$inferInsert;
