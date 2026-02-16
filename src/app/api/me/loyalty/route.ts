import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { loyaltyTransactions, loyaltyWallets } from "@/lib/db/schema/loyalty";
import { computeLoyalty } from "@/lib/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /api/me/loyalty
 * Returns a loyalty snapshot + last 50 transactions for the authenticated user.
 *
 * NOTE: This route assumes your loyalty tables are keyed by Clerk userId in
 * loyaltyWallets.customerId and loyaltyTransactions.customerId (as in your existing code).
 * If your schema instead uses a numeric customer PK, switch these lookups accordingly.
 */
export async function GET() {
  try {
    const { userId } = await auth(); // Next 15+: await required
    if (!userId) return jsonError(401, "unauthorized");

    const [walletRow] =
      (await db
        .select()
        .from(loyaltyWallets)
        .where(eq(loyaltyWallets.customerId, userId))
        .limit(1)) ?? [];

    const pointsBalance = num((walletRow as any)?.pointsBalance ?? 0, 0);
    const snapshot = computeLoyalty(pointsBalance);

    const txns = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, userId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(50);

    return NextResponse.json({
      ok: true,
      wallet: snapshot,
      transactions: txns,
    });
  } catch (e: any) {
    console.error("GET /api/me/loyalty failed:", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

// Guard other methods.
export async function POST() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = POST;
export const DELETE = POST;
