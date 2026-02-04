import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { carts } from "./cart";
import { cartLines } from "./cart_lines";
/**
 * cart_attachments (v2)
 * ✅ line-only attachments (line_id NOT NULL)
 * ✅ cart_id removed (infer via cart_lines.cart_id)
 * ✅ timestamps are timestamptz
 */
export const cartAttachments = pgTable(
  "cart_attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    lineId: uuid("line_id")
      .notNull()
      .references(() => cartLines.id, { onDelete: "cascade" }),

    productId: integer("product_id").notNull(),

    fileName: text("file_name").notNull(),

    key: text("key").notNull(),

    url: text("url").notNull(),

    thumbKey: text("thumb_key"),

    thumbUrl: text("thumb_url"),

    cfImageId: text("cf_image_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    cartAttachmentsLineIdIdx: index("cart_attachments_line_id_idx").on(t.lineId),
    cartAttachmentsLineKeyUq: uniqueIndex("cart_attachments_line_key_uq").on(
      t.lineId,
      t.key
    ),
  })
);