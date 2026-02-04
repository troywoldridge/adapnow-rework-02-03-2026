import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cartLines } from "./cart_lines";

/**
 * cart_artwork (already timestamptz)
 */
export const cartArtwork = pgTable("cart_artwork", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  cartLineId: uuid("cart_line_id")
    .notNull()
    .references(() => cartLines.id, { onDelete: "cascade" }),

  side: integer("side").notNull(),

  url: text("url").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});