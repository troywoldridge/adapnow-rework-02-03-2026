// src/lib/db/schema/customerAddresses.ts
import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, customType, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * citext support
 * DB already uses citext for customer_addresses.email.
 * This keeps schema aligned so drizzle-kit won't try to create/rename weirdly.
 */
const citext = customType<{ data: string | null }>({
  dataType() {
    return "citext";
  },
});

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").notNull().primaryKey().default(sql`gen_random_uuid()`),

    customerId: uuid("customer_id").notNull(),

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
  (t) => ({
    idxCustomerAddressesCreatedAt: index("idx_customer_addresses_created_at").on(t.createdAt),
    idxCustomerAddressesCustomer: index("idx_customer_addresses_customer").on(t.customerId),
    // NOTE: your DB also has partial unique indexes for default billing/shipping.
    // Those are usually created via SQL migrations (Drizzle can model them, but partial uniques are best handled in migrations).
  }),
);
