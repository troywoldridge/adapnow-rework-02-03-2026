// src/lib/db/schema/cartArtwork.ts
import { pgTable, uuid, text, jsonb, timestamp, index, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { cartLines } from "./cartLines";

/**
 * cart_artwork
 * Artwork files attached to a specific cart line (front/back/etc).
 * Keep this table flexible: we store file metadata + URLs as text/json.
 */
export const cartArtwork = pgTable(
  "cart_artwork",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    cartLineId: uuid("cart_line_id")
      .notNull()
      .references(() => cartLines.id, { onDelete: "cascade" }),

    // Optional: which side this artwork belongs to (1=front, 2=back, etc.)
    side: integer("side").notNull().default(1),

    // Human friendly label (optional)
    label: text("label"),

    // Storage key + public URL
    key: text("key").notNull(),
    url: text("url").notNull(),

    fileName: text("file_name").notNull().default("artwork"),
    contentType: text("content_type"),

    // Optional extra metadata (dimensions, pages, checksum, etc.)
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cartArtworkLineIdx: index("cart_artwork_line_idx").on(t.cartLineId),
  }),
);
