import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";

import { customers } from "@/lib/db/schema/customer";
import { loyaltyWallets, loyaltyTransactions } from "@/lib/db/schema/loyalty";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type CustomerInsert = typeof customers.$inferInsert;
type WalletInsert = typeof loyaltyWallets.$inferInsert;
type LoyaltyTxInsert = typeof loyaltyTransactions.$inferInsert;

export type LoyaltySnapshot = {
  customerId: string;
  pointsBalance: number;
};

function toInt(v: unknown, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

async function ensureCustomerAndWallet(
  tx: Tx,
  args: { clerkUserId: string; email?: string | null },
) {
  const clerkUserId = String(args.clerkUserId || "").trim();
  if (!clerkUserId) throw new Error("missing clerkUserId");

  // customer
  let cust =
    (await tx.query.customers.findFirst({
      where: eq(customers.clerkUserId, clerkUserId),
    })) ?? null;

  if (!cust) {
    const email = args.email ? String(args.email).trim().toLowerCase() : null;
    if (!email) throw new Error("missing email");

    const insertCustomer: CustomerInsert = { clerkUserId, email };
    const inserted = await tx.insert(customers).values(insertCustomer).returning();
    cust = inserted?.[0] ?? null;
    if (!cust) throw new Error("customer insert failed");
  }

  // wallet
  let wallet =
    (await tx.query.loyaltyWallets.findFirst({
      where: eq(loyaltyWallets.customerId, cust.id),
    })) ?? null;

  if (!wallet) {
    const insertWallet: WalletInsert = { customerId: cust.id, pointsBalance: 0 };
    const inserted = await tx.insert(loyaltyWallets).values(insertWallet).returning();
    wallet = inserted?.[0] ?? null;
    if (!wallet) throw new Error("wallet insert failed");
  }

  return { cust, wallet };
}

/**
 * Award points (earn) to a customer.
 * Returns snapshot after the change.
 */
export async function awardLoyaltyPoints(args: {
  clerkUserId: string;
  email?: string | null;
  points: number;
  reason?: string | null;
  orderId?: string | null;
}): Promise<{ changed: boolean; snapshot: LoyaltySnapshot }> {
  const points = toInt(args.points, 0);

  // If points = 0, return snapshot without changing anything.
  if (points === 0) {
    const snap = await getLoyaltySnapshotByClerkUserId(args.clerkUserId).catch(() => null);
    if (snap) return { changed: false, snapshot: snap };
    return { changed: false, snapshot: { customerId: "", pointsBalance: 0 } };
  }

  return await db.transaction(async (tx) => {
    const { cust, wallet } = await ensureCustomerAndWallet(tx, {
      clerkUserId: args.clerkUserId,
      email: args.email ?? null,
    });

    const before = toInt(wallet.pointsBalance, 0);
    const after = Math.max(0, before + points);

    // record transaction
    const insertTx: LoyaltyTxInsert = {
      customerId: cust.id,
      deltaPoints: points,
      reason: args.reason ?? "earn",
      orderId: args.orderId ?? null,
      createdAt: new Date(),
    };
    await tx.insert(loyaltyTransactions).values(insertTx);

    // update wallet
    await tx
      .update(loyaltyWallets)
      .set({ pointsBalance: after })
      .where(eq(loyaltyWallets.id, wallet.id));

    return {
      changed: true,
      snapshot: { customerId: cust.id, pointsBalance: after },
    };
  });
}

/**
 * Read snapshot by Clerk user id.
 */
export async function getLoyaltySnapshotByClerkUserId(
  clerkUserId: string,
): Promise<LoyaltySnapshot | null> {
  const id = String(clerkUserId || "").trim();
  if (!id) return null;

  const cust =
    (await db.query.customers.findFirst({
      where: eq(customers.clerkUserId, id),
    })) ?? null;

  if (!cust) return null;

  const wallet =
    (await db.query.loyaltyWallets.findFirst({
      where: eq(loyaltyWallets.customerId, cust.id),
    })) ?? null;

  return {
    customerId: cust.id,
    pointsBalance: toInt(wallet?.pointsBalance, 0),
  };
}
