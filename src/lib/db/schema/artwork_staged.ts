import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { carts } from "./cart";
import { cartLines } from "./cart_lines";

/**
 * artwork_staged (already timestamptz)
 */
export const artworkStaged = pgTable(
  "artwork_staged",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    sid: text("sid").notNull(),

    draftId: text("draft_id").notNull(),

    productId: integer("product_id").notNull(),

    optionIds: jsonb("option_ids").notNull().default(sql`'[]'::jsonb`),

    side: integer("side").notNull().default(1),

    fileName: text("file_name").notNull(),

    key: text("key").notNull(),

    url: text("url").notNull(),

    contentType: text("content_type"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    artworkStagedDraftIdx: index("artwork_staged_draft_idx").on(t.draftId),
    artworkStagedSidDraftIdx: index("artwork_staged_sid_draft_idx").on(
      t.sid,
      t.draftId
    ),
  })
);