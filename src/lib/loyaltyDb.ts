// src/lib/loyaltyDb.ts
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";

import { loyaltyWallets, loyaltyTransactions } from "@/lib/db/schema";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type LoyaltyDbSnapshot = {
  customerId: string; // Clerk user id
  walletId: string;
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
};

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function ensureWallet(tx: Tx, clerkUserId: string) {
  const customerId = norm(clerkUserId);
  if (!customerId) throw new Error("missing customerId (clerkUserId)");

  const existing =
    (await tx
      .select()
      .from(loyaltyWallets)
      .where(eq(loyaltyWallets.customerId, customerId))
      .limit(1)
      .then((r) => r[0] ?? null)) ?? null;

  if (existing) return existing;

  const inserted = await tx
    .insert(loyaltyWallets)
    .values({
      customerId,
      pointsBalance: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
      // createdAt/updatedAt handled by defaultNow()
    } as typeof loyaltyWallets.$inferInsert)
    .returning();

  const wallet = inserted?.[0] ?? null;
  if (!wallet) throw new Error("wallet insert failed");
  return wallet;
}

function snapshotFromWallet(customerId: string, w: any): LoyaltyDbSnapshot {
  return {
    customerId,
    walletId: String(w?.id ?? ""),
    pointsBalance: toInt(w?.pointsBalance, 0),
    lifetimeEarned: toInt(w?.lifetimeEarned, 0),
    lifetimeRedeemed: toInt(w?.lifetimeRedeemed, 0),
  };
}

/**
 * Read snapshot by Clerk user id (customerId).
 */
export async function getLoyaltySnapshotByClerkUserId(clerkUserId: string): Promise<LoyaltyDbSnapshot | null> {
  const customerId = norm(clerkUserId);
  if (!customerId) return null;

  const wallet =
    (await db
      .select()
      .from(loyaltyWallets)
      .where(eq(loyaltyWallets.customerId, customerId))
      .limit(1)
      .then((r) => r[0] ?? null)) ?? null;

  if (!wallet) return null;
  return snapshotFromWallet(customerId, wallet);
}

/**
 * Award (earn) points to a customer.
 * - Creates wallet if missing
 * - Inserts loyalty transaction (delta > 0)
 * - Updates wallet pointsBalance + lifetimeEarned
 */
export async function awardLoyaltyPoints(args: {
  clerkUserId: string;
  points: number;
  reason?: "purchase" | "refund" | "adjustment" | "signup" | "promotion";
  orderId?: string | null;
  note?: string | null;
}): Promise<{ changed: boolean; snapshot: LoyaltyDbSnapshot }> {
  const customerId = norm(args.clerkUserId);
  const points = toInt(args.points, 0);
  if (!customerId) {
    return {
      changed: false,
      snapshot: { customerId: "", walletId: "", pointsBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 },
    };
  }

  if (points <= 0) {
    const snap = await getLoyaltySnapshotByClerkUserId(customerId).catch(() => null);
    if (snap) return { changed: false, snapshot: snap };
    return {
      changed: false,
      snapshot: { customerId, walletId: "", pointsBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 },
    };
  }

  return await db.transaction(async (tx) => {
    const wallet = await ensureWallet(tx, customerId);

    const beforeBal = toInt(wallet.pointsBalance, 0);
    const beforeEarned = toInt(wallet.lifetimeEarned, 0);

    const afterBal = Math.max(0, beforeBal + points);
    const afterEarned = Math.max(0, beforeEarned + points);

    await tx.insert(loyaltyTransactions).values({
      walletId: wallet.id,
      customerId,
      orderId: args.orderId ?? null,
      delta: points,
      reason: (args.reason ?? "purchase") as any,
      note: args.note ?? null,
      // createdAt handled by defaultNow()
    } as typeof loyaltyTransactions.$inferInsert);

    const [updated] = await tx
      .update(loyaltyWallets)
      .set({
        pointsBalance: afterBal,
        lifetimeEarned: afterEarned,
        updatedAt: new Date(),
      } as any)
      .where(eq(loyaltyWallets.id, wallet.id))
      .returning();

    return { changed: true, snapshot: snapshotFromWallet(customerId, updated ?? wallet) };
  });
}

/**
 * Redeem points (delta < 0).
 * - Ensures wallet exists
 * - Clamps redemption so you never go below 0
 * - Inserts transaction
 * - Updates wallet pointsBalance + lifetimeRedeemed
 */
export async function redeemLoyaltyPoints(args: {
  clerkUserId: string;
  points: number; // positive number requested to redeem
  reason?: "purchase" | "refund" | "adjustment" | "signup" | "promotion";
  orderId?: string | null;
  note?: string | null;
}): Promise<{ changed: boolean; snapshot: LoyaltyDbSnapshot; redeemedPoints: number }> {
  const customerId = norm(args.clerkUserId);
  const req = Math.max(0, toInt(args.points, 0));
  if (!customerId || req === 0) {
    const snap = await getLoyaltySnapshotByClerkUserId(customerId).catch(() => null);
    return {
      changed: false,
      redeemedPoints: 0,
      snapshot: snap ?? { customerId, walletId: "", pointsBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 },
    };
  }

  return await db.transaction(async (tx) => {
    const wallet = await ensureWallet(tx, customerId);

    const beforeBal = Math.max(0, toInt(wallet.pointsBalance, 0));
    const beforeRedeemed = Math.max(0, toInt(wallet.lifetimeRedeemed, 0));

    const redeemable = Math.min(req, beforeBal);
    if (redeemable <= 0) {
      return { changed: false, redeemedPoints: 0, snapshot: snapshotFromWallet(customerId, wallet) };
    }

    const afterBal = beforeBal - redeemable;
    const afterRedeemed = beforeRedeemed + redeemable;

    await tx.insert(loyaltyTransactions).values({
      walletId: wallet.id,
      customerId,
      orderId: args.orderId ?? null,
      delta: -redeemable,
      reason: (args.reason ?? "purchase") as any,
      note: args.note ?? null,
    } as typeof loyaltyTransactions.$inferInsert);

    const [updated] = await tx
      .update(loyaltyWallets)
      .set({
        pointsBalance: afterBal,
        lifetimeRedeemed: afterRedeemed,
        updatedAt: new Date(),
      } as any)
      .where(eq(loyaltyWallets.id, wallet.id))
      .returning();

    return {
      changed: true,
      redeemedPoints: redeemable,
      snapshot: snapshotFromWallet(customerId, updated ?? wallet),
    };
  });
}
