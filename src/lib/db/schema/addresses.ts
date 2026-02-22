import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * NOTE:
 * Your database has `customer_addresses`, not `addresses`.
 * Some routes still import `@/lib/db/schema/addresses`.
 *
 * We keep that import stable by exporting `addresses` as the Drizzle table
 * mapping to `customer_addresses`.
 */

/** Minimal citext support (Postgres extension). */
const citext = text;

/**
 * customer_addresses
 * Matches DB schema you showed:
 *  - id uuid PK default gen_random_uuid()
 *  - customer_id uuid NOT NULL FK -> customers(id) ON DELETE CASCADE
 *  - label, first_name, last_name, company nullable
 *  - email citext nullable
 *  - phone_enc, phone_last4 nullable
 *  - street1/city/state/postal_code/country NOT NULL
 *  - is_default_shipping/is_default_billing NOT NULL default false
 *  - sort_order NOT NULL default 0
 *  - metadata NOT NULL default '{}'
 *  - created_at/updated_at NOT NULL default now()
 *  - deleted_at nullable
 *
 * If your codebase later standardizes naming to `customerAddresses`,
 * you can re-export that from schema/index.ts — but this keeps builds unblocked.
 */
export const addresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id")
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),

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

    // DB constraint: chk_country_iso2 CHECK (country ~ '^[A-Z]{2}$')
    country: text("country").notNull(),

    isDefaultShipping: boolean("is_default_shipping").notNull().default(false),
    isDefaultBilling: boolean("is_default_billing").notNull().default(false),

    sortOrder: integer("sort_order").notNull().default(0),

    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    idxCreatedAt: index("idx_customer_addresses_created_at").on(t.createdAt),
    idxCustomer: index("idx_customer_addresses_customer").on(t.customerId),

    // These exist in your DB as partial unique indexes. Drizzle can declare them,
    // but expressions/WHERE clauses aren’t always portable in schema declarations.
    // Keeping only the non-partial indexes here avoids migration churn.
    //
    // If you later want to reflect partial uniques in Drizzle schema, we can add
    // custom SQL migrations and omit them from schema declarations.
    //
    // uniqDefaultShipping: uniqueIndex("uniq_customer_addresses_default_shipping")
    //   .on(t.customerId)
    //   .where(sql`${t.isDefaultShipping} = true AND ${t.deletedAt} IS NULL`),
    //
    // uniqDefaultBilling: uniqueIndex("uniq_customer_addresses_default_billing")
    //   .on(t.customerId)
    //   .where(sql`${t.isDefaultBilling} = true AND ${t.deletedAt} IS NULL`),
  }),
);
