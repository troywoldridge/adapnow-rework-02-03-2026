import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { loyaltyTransactions, loyaltyWallets } from "@/lib/db/schema/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type UiTxn = {
  id: string;
  type: "earn" | "redeem" | "adjustment";
  pointsDelta: number;
  reason: "purchase" | "refund" | "adjustment" | "signup" | "promotion" | string;
  note: string | null;
  orderId: string | null;
  createdAt: string;
  balanceAfter: number;
  source?: string | null;
};

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function toIso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  try {
    const dd = new Date(String(d));
    if (!Number.isNaN(dd.getTime())) return dd.toISOString();
  } catch {
    // ignore
  }
  return String(d ?? "");
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /api/loyalty/history
 * Returns current loyalty balance + up to 200 recent transactions (newest first),
 * with balanceAfter computed per row.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return jsonError(401, "unauthorized");

  try {
    // Current wallet balance
    const wallet = await db.query.loyaltyWallets.findFirst({
      where: eq(loyaltyWallets.customerId, userId),
    });

    const currentBalance = num(wallet?.pointsBalance ?? 0, 0);

    // Recent transactions (newest first)
    // NOTE: schema in your snippet uses delta/reason; adjust if your table differs.
    const txns = await db
      .select({
        id: loyaltyTransactions.id,
        delta: (loyaltyTransactions as any).delta ?? (loyaltyTransactions as any).points,
        reason: (loyaltyTransactions as any).reason ?? (loyaltyTransactions as any).type,
        note: loyaltyTransactions.note,
        orderId: loyaltyTransactions.orderId,
        createdAt: loyaltyTransactions.createdAt,
        source: (loyaltyTransactions as any).source,
      })
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, userId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(200);

    // Compute balanceAfter per row while iterating newest->oldest.
    // balanceAfter should represent the balance after that txn (i.e., current running before rewinding).
    let running = currentBalance;

    const items: UiTxn[] = txns.map((row: any) => {
      const delta = num(row?.delta ?? 0, 0);

      const type: UiTxn["type"] =
        delta > 0 ? "earn" : delta < 0 ? "redeem" : "adjustment";

      const item: UiTxn = {
        id: String(row.id),
        type,
        pointsDelta: delta,
        reason: String(row.reason ?? "adjustment"),
        note: row.note ?? null,
        orderId: row.orderId ?? null,
        createdAt: toIso(row.createdAt),
        balanceAfter: running,
        source: row.source ?? null,
      };

      // rewind to previous balance
      running -= delta;

      return item;
    });

    return NextResponse.json({ ok: true, balance: currentBalance, items });
  } catch (e: any) {
    console.error("GET /api/loyalty/history failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/** Guard other methods. */
export async function POST() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = POST;
export const DELETE = POST;
