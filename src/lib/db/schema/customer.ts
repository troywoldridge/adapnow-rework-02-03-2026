// src/lib/db/schema/customer.ts
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    // Canonical app identity
    clerkUserId: text("clerk_user_id").notNull(),

    // Optional profile fields (safe defaults)
    email: text("email"),
    firstName: text("first_name"),
    lastName: text("last_name"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uniq_customers_clerk_user_id").on(t.clerkUserId),
    index("idx_customers_email").on(t.email),
  ],
);

export type CustomerRow = typeof customers.$inferSelect;
export type CustomerInsert = typeof customers.$inferInsert;
