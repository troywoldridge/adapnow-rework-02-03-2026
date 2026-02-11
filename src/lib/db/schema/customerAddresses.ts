// src/lib/db/schema/customerAddresses.ts
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { customers } from "./customer";

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    clerkUserId: text("clerk_user_id").notNull(),

    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),

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
    index("idx_customer_addresses_clerk").on(t.clerkUserId),
    index("idx_customer_addresses_customer").on(t.customerId),

    // Ensure at most one default address per clerk user
    uniqueIndex("uniq_customer_addresses_default_by_clerk")
      .on(t.clerkUserId)
      .where(sql`is_default = true`),
  ],
);

export type CustomerAddressRow = typeof customerAddresses.$inferSelect;
export type CustomerAddressInsert = typeof customerAddresses.$inferInsert;
