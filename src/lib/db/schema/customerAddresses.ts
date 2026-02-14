// src/lib/db/schema/customerAddresses.ts
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { customers } from "./customer";

// citext support (Postgres extension). Treat as string in TS.
const citext = customType<{ data: string | null; notNull: false }>({
  dataType() {
    return "citext";
  },
});

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),

    label: text("label"),

    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),

    email: citext("email"),

    phoneEnc: text("phone_enc"),
    phoneLast4: text("phone_last4"),

    street1: text("street1").notNull(),
    street2: text("street2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull(),

    isDefaultShipping: boolean("is_default_shipping").notNull().default(false),
    isDefaultBilling: boolean("is_default_billing").notNull().default(false),

    sortOrder: integer("sort_order").notNull().default(0),

    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_customer_addresses_customer").on(t.customerId),
    index("idx_customer_addresses_created_at").on(t.createdAt),

    uniqueIndex("uniq_customer_addresses_default_shipping")
      .on(t.customerId)
      .where(sql`is_default_shipping = true and deleted_at is null`),

    uniqueIndex("uniq_customer_addresses_default_billing")
      .on(t.customerId)
      .where(sql`is_default_billing = true and deleted_at is null`),
  ],
);

export type CustomerAddressRow = typeof customerAddresses.$inferSelect;
export type CustomerAddressInsert = typeof customerAddresses.$inferInsert;
