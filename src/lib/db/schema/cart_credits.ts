import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { carts } from "./cart"; 
import { cartLines } from "./cart_lines";

/**
 * cart_credits (v2 timestamps -> timestamptz)
 */
export const cartCredits = pgTable(
  "cart_credits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),

    source: text("source").notNull().default("loyalty"),

    amountCents: integer("amount_cents").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxCartCreditsCart: index("idx_cart_credits_cart").on(t.cartId),
  })
);
