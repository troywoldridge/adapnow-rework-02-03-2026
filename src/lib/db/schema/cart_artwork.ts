// src/lib/db/schema/cart_artwork.ts
//
// CANONICAL table: public.cart_artwork
// Cart-line specific artwork attachments (often per-side).

import { pgTable, uuid, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const cartArtwork = pgTable(
  "cart_artwork",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    cartLineId: uuid("cart_line_id").notNull(),
    side: integer("side").notNull().default(1),

    label: text("label"),
    key: text("key").notNull(),
    url: text("url").notNull(),

    fileName: text("file_name").notNull().default("artwork"),
    contentType: text("content_type"),

    meta: jsonb("meta").notNull().default({}).$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lineIdx: index("cart_artwork_line_idx").on(t.cartLineId),
  })
);

export type CartArtwork = typeof cartArtwork.$inferSelect;
export type NewCartArtwork = typeof cartArtwork.$inferInsert;
