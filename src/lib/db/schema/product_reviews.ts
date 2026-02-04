// src/lib/db/schema/product_reviews.ts
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const productReviews = pgTable(
  "product_reviews",
  {
    id: serial("id").primaryKey(), // nextval('product_reviews_id_seq'::regclass)

    productId: varchar("product_id", { length: 48 }).notNull(),

    name: varchar("name", { length: 60 }).notNull(),
    email: varchar("email", { length: 80 }),

    rating: integer("rating").notNull(),
    comment: text("comment").notNull(),

    approved: boolean("approved").default(false),

    userIp: varchar("user_ip", { length: 45 }),

    termsAgreed: boolean("terms_agreed").default(false),

    createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),

    verified: boolean("verified").default(false),
  },
  (t) => ({
    reviewsApprovedIdx: index("reviews_approved_idx").on(t.approved),
    reviewsCreatedAtIdx: index("reviews_created_at_idx").on(t.createdAt),
    reviewsProductIdIdx: index("reviews_product_id_idx").on(t.productId),
    reviewsRatingIdx: index("reviews_rating_idx").on(t.rating),
  })
);
