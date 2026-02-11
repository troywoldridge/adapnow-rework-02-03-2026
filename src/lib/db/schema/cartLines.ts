// src/lib/db/schema/cartLines.ts
import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { carts } from "./cart";

/**
 * cart_lines
 * - Holds the "authoritative" optionIds[] used to price via SinaLite:
 *   POST /price/:productId/:storeCode  { productOptions: [..] }
 * - Stores pricing snapshot in cents so checkout is deterministic.
 * - artwork stays flexible (jsonb) for staged uploads -> attachment flow.
 */
export const cartLines = pgTable(
  "cart_lines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),

    productId: integer("product_id").notNull(),

    // Qty is both:
    // - your cart qty multiplier
    // - ALSO usually represented as a SinaLite option id in optionIds (group "qty")
    quantity: integer("quantity").notNull().default(1),

    // Deterministic pricing snapshot (what we actually charge)
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull().default(0),

    // SinaLite product option ids (MUST contain 1 option from each group)
    // Stored as jsonb array of numbers.
    optionIds: jsonb("option_ids").notNull().default(sql`'[]'::jsonb`),

    // Optional helpers (not required yet, but super useful later)
    // - optionChain: stable string representation ("30,4,105,93,540,140") OR your 12-digit chain
    optionChain: text("option_chain"),
    // - pricingHash: if you still use a derived hash locally (md5 / etc.)
    pricingHash: text("pricing_hash"),

    // Artwork snapshot / attachments / staged refs
    artwork: jsonb("artwork").notNull().default(sql`'[]'::jsonb`),

    // Currency for the line (keep consistent with cart; used to choose storeCode en_us/en_ca)
    currency: text("currency").notNull().default("USD"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cartLinesCartIdx: index("cart_lines_cart_idx").on(t.cartId),
    cartLinesProductIdx: index("cart_lines_product_idx").on(t.productId),
    cartLinesCartProductIdx: index("cart_lines_cart_product_idx").on(t.cartId, t.productId),
    cartLinesPricingHashIdx: index("cart_lines_pricing_hash_idx").on(t.pricingHash),
  }),
);
