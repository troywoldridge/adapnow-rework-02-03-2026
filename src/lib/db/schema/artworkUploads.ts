// src/lib/db/schema/artworkUploads.ts
import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

/**
 * artwork_uploads
 * Stores uploaded artwork files tied to a product/order/user.
 *
 * Notes:
 * - productId/orderId/userId are varchar because upstream systems often use string IDs.
 * - fileUrl is the canonical public URL (R2/CDN/etc).
 * - approved is a simple workflow flag.
 */
export const artworkUploads = pgTable(
  "artwork_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    productId: varchar("product_id", { length: 48 }).notNull(),
    orderId: varchar("order_id", { length: 48 }),
    userId: varchar("user_id", { length: 64 }),

    fileUrl: varchar("file_url", { length: 255 }).notNull(),
    fileName: varchar("file_name", { length: 128 }).notNull(),

    fileSize: integer("file_size"),
    fileType: varchar("file_type", { length: 64 }),

    approved: boolean("approved").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    artworkUploadsProductIdx: index("artwork_uploads_product_idx").on(t.productId),
    artworkUploadsOrderIdx: index("artwork_uploads_order_idx").on(t.orderId),
    artworkUploadsUserIdx: index("artwork_uploads_user_idx").on(t.userId),
    artworkUploadsApprovedIdx: index("artwork_uploads_approved_idx").on(t.approved),
  })
);
