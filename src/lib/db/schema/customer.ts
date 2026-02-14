// src/lib/db/schema/customer.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// citext support (Postgres extension). Treat as string in TS.
const citext = customType<{ data: string | null; notNull: false }>({
  dataType() {
    return "citext";
  },
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    clerkUserId: text("clerk_user_id").notNull(),

    email: citext("email"),

    firstName: text("first_name"),
    lastName: text("last_name"),
    displayName: text("display_name"),

    phoneEnc: text("phone_enc"),
    phoneLast4: text("phone_last4"),

    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    role: text("role").notNull().default("customer"),

    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uniq_customers_clerk_user_id").on(t.clerkUserId),
    index("idx_customers_email").on(t.email),
    index("idx_customers_created_at").on(t.createdAt),

    uniqueIndex("uniq_customers_email_not_null")
      .on(t.email)
      .where(sql`email is not null and deleted_at is null`),
  ],
);

export type CustomerRow = typeof customers.$inferSelect;
export type CustomerInsert = typeof customers.$inferInsert;
