// src/lib/db/schema/artwork_uploads.ts
//
// CANONICAL table: public.artwork_uploads
// This represents staged artwork uploads tied to products/orders/users.
//
// Stage 3 consolidation:
// - This is the authoritative staged-artwork representation.
// - Legacy "artwork_staged"/"artworkStaged" modules should re-export this table.

import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const artworkUploads = pgTable(
  "artwork_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),

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
    approvedIdx: index("artwork_uploads_approved_idx").on(t.approved),
    orderIdx: index("artwork_uploads_order_idx").on(t.orderId),
    productIdx: index("artwork_uploads_product_idx").on(t.productId),
    userIdx: index("artwork_uploads_user_idx").on(t.userId),
  })
);

export type ArtworkUpload = typeof artworkUploads.$inferSelect;
export type NewArtworkUpload = typeof artworkUploads.$inferInsert;
