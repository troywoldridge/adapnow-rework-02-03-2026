// src/lib/db/schema/addresses.ts
// User addresses table - used by addresses.ts lib (userId-scoped).
// Distinct from customer_addresses which uses clerkUserId.

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    userId: text("user_id").notNull(),

    label: text("label"),

    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),
    phone: text("phone"),

    street1: text("street1").notNull(),
    street2: text("street2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull(),

    isDefault: boolean("is_default").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_addresses_user_id").on(t.userId),
    index("idx_addresses_user_default").on(t.userId, t.isDefault),
  ]
);

export type AddressRow = typeof addresses.$inferSelect;
export type AddressInsert = typeof addresses.$inferInsert;
