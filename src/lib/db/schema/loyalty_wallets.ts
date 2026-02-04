// src/lib/db/schema/loyalty_wallets.ts
import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const loyaltyWallets = pgTable(
  "loyalty_wallets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    customerId: text("customer_id").notNull(),

    pointsBalance: integer("points_balance").notNull().default(0),

    lifetimeEarned: integer("lifetime_earned").notNull().default(0),

    lifetimeRedeemed: integer("lifetime_redeemed").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxWalletsCustomer: index("idx_wallets_customer").on(t.customerId),
    uniqLoyaltyWalletByCustomer: uniqueIndex("uniq_loyalty_wallet_by_customer").on(t.customerId),
  })
);
