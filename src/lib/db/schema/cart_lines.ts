import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { carts } from "./cart";


/**
 * cart_lines
 * - timestamps are timestamptz
 */
export const cartLines = pgTable(
  "cart_lines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),

    productId: integer("product_id").notNull(),

    quantity: integer("quantity").notNull().default(1),

    unitPriceCents: integer("unit_price_cents").notNull().default(0),

    lineTotalCents: integer("line_total_cents"),

    optionIds: jsonb("option_ids").notNull().default(sql`'[]'::jsonb`),

    artwork: jsonb("artwork"),

    currency: text("currency").notNull().default("USD"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    cartLinesCartIdx: index("cart_lines_cart_idx").on(t.cartId),
  })
);
