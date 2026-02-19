// src/lib/db/schema/reviewHelpfulVotes.ts
import { pgTable, serial, integer, varchar, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * review_helpful_votes
 *
 * Idempotency:
 * - Unique per (review_id, voter_fingerprint)
 *
 * Notes:
 * - user_id is optional (Clerk userId if present)
 * - ip stored for abuse analytics / debugging
 */
export const reviewHelpfulVotes = pgTable(
  "review_helpful_votes",
  {
    id: serial("id").primaryKey(),

    reviewId: integer("review_id").notNull(),

    voterFingerprint: varchar("voter_fingerprint", { length: 64 }).notNull(),

    userId: varchar("user_id", { length: 128 }),

    ip: varchar("ip", { length: 64 }).notNull(),

    isHelpful: boolean("is_helpful").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Ensures one vote per review per fingerprint (your route relies on this for idempotency)
    uniqReviewFingerprint: uniqueIndex("review_helpful_votes_review_fp_uq").on(
      t.reviewId,
      t.voterFingerprint,
    ),
  }),
);
