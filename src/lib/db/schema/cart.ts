import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * carts (Node runtime app)
 * - selected_shipping is SQL NULL until chosen (no json null default)
 * - timestamps are timestamptz
 */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    sid: text("sid").notNull(),

    status: text("status").notNull().default("open"),

    userId: text("user_id"),

    currency: text("currency").notNull().default("USD"),

    // ✅ preferred: SQL NULL when not selected; set to JSON object when selected
    selectedShipping: jsonb("selected_shipping"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    cartsSidStatusIdx: index("carts_sid_status_idx").on(t.sid, t.status),
    idxCartsSid: index("idx_carts_sid").on(t.sid),
    idxCartsStatus: index("idx_carts_status").on(t.status),
    idxCartsUser: index("idx_carts_user").on(t.userId),
  })
);