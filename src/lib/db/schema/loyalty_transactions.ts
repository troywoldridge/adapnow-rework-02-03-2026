// src/lib/db/schema/loyalty_transactions.ts
import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { orders } from "./orders";
import { loyaltyWallets } from "./loyalty_wallets";
import { loyaltyReason } from "./enums"; // canonical enum lives in enums.ts

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    walletId: uuid("wallet_id")
      .notNull()
      .references(() => loyaltyWallets.id, { onDelete: "cascade" }),

    customerId: text("customer_id").notNull(),

    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),

    delta: integer("delta").notNull(),

    reason: loyaltyReason("reason").notNull(),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTxnCustomer: index("idx_txn_customer").on(t.customerId),
    idxTxnOrder: index("idx_txn_order").on(t.orderId),
    idxTxnWallet: index("idx_txn_wallet").on(t.walletId),
  })
);
