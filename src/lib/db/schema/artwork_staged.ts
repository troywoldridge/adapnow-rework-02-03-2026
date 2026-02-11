// src/lib/db/schema/artwork_staged.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * artwork_staged
 * Temporary holding area for upload-before-cart flow.
 * Rows are keyed by (sid, draftId, side) so the client can upload artwork
 * before a cart line exists, then attach them when the line is created.
 *
 * Idempotency:
 * - unique(sid, draft_id, side) prevents duplicate “front/back” rows on retries.
 */
export const artworkStaged = pgTable(
  "artwork_staged",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    sid: text("sid").notNull(),
    draftId: text("draft_id").notNull(),

    productId: integer("product_id").notNull(),

    // Stored as jsonb array of option IDs
    optionIds: jsonb("option_ids").notNull().default(sql`'[]'::jsonb`),

    // 1 = front by default, 2 = back, etc.
    side: integer("side").notNull().default(1),

    fileName: text("file_name").notNull(),
    key: text("key").notNull(),
    url: text("url").notNull(),

    contentType: text("content_type"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    artworkStagedDraftIdx: index("artwork_staged_draft_idx").on(t.draftId),
    artworkStagedSidDraftIdx: index("artwork_staged_sid_draft_idx").on(t.sid, t.draftId),

    // One staged file per side for a draft+session
    artworkStagedSidDraftSideUq: uniqueIndex("artwork_staged_sid_draft_side_uq").on(
      t.sid,
      t.draftId,
      t.side,
    ),
  }),
);

export type ArtworkStagedRow = typeof artworkStaged.$inferSelect;
export type ArtworkStagedInsert = typeof artworkStaged.$inferInsert;
