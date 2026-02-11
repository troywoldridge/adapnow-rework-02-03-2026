// src/lib/db/schema/cartCredits.ts
import { pgTable, uuid, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { carts } from "./cart";

/**
 * cart_credits
 * Credits applied to a cart (loyalty points redemption, promo adjustments, manual credits).
 * You already compute totals as: subtotal + shipping + tax - credits.
 */
export const cartCredits = pgTable(
  "cart_credits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),

    // Store cents directly to avoid currency rounding issues.
    amountCents: integer("amount_cents").notNull().default(0),

    // Optional: bookkeeping fields
    reason: text("reason").notNull().default("credit"), // "loyalty" | "promo" | "manual" | etc.
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cartCreditsCartIdx: index("cart_credits_cart_idx").on(t.cartId),
    cartCreditsReasonIdx: index("cart_credits_reason_idx").on(t.reason),
  }),
);
