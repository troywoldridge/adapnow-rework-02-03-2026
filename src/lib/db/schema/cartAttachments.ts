// src/lib/db/schema/cartAttachments.ts
import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { cartLines } from "./cartLines";

/**
 * cart_attachments
 * General attachments for a cart line (proofs, notes, reference files, etc.)
 * If you already use cart_artwork for print sides, keep this for "other" files.
 */
export const cartAttachments = pgTable(
  "cart_attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    cartLineId: uuid("cart_line_id")
      .notNull()
      .references(() => cartLines.id, { onDelete: "cascade" }),

    kind: text("kind").notNull().default("attachment"), // "proof" | "reference" | "attachment" etc.

    key: text("key").notNull(),
    url: text("url").notNull(),

    fileName: text("file_name").notNull().default("attachment"),
    contentType: text("content_type"),

    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cartAttachmentsLineIdx: index("cart_attachments_line_idx").on(t.cartLineId),
    cartAttachmentsKindIdx: index("cart_attachments_kind_idx").on(t.kind),
  }),
);
