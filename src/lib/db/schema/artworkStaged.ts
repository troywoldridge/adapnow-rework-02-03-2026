// src/lib/db/schema/artworkStaged.ts
import { pgTable, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const artworkStaged = pgTable(
  "artwork_staged",
  {
    id: text("id").primaryKey(), // uuid string
    sid: text("sid").notNull(), // session id cookie
    draftId: text("draft_id").notNull(), // ties uploads to a configured item flow

    productId: integer("product_id").notNull(),

    // optional but super useful for auditing/debugging
    optionIds: jsonb("option_ids").$type<number[]>().notNull().default([]),

    side: integer("side").notNull().default(1), // 1=front,2=back,3+=other
    fileName: text("file_name").notNull(),
    key: text("key").notNull(), // R2 object key
    url: text("url").notNull(), // public URL (CDN)
    contentType: text("content_type"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sidDraftIdx: index("artwork_staged_sid_draft_idx").on(t.sid, t.draftId),
    draftIdx: index("artwork_staged_draft_idx").on(t.draftId),
  }),
);
