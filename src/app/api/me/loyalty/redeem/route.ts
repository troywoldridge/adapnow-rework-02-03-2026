import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db";
import { loyaltyTransactions, loyaltyWallets } from "@/lib/db/schema/loyalty";
import { LOYALTY, computeLoyalty, pointsToCreditDollars } from "@/lib/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function toPositiveInt(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return NaN;
  const i = Math.trunc(n);
  return i > 0 ? i : NaN;
}

function toNote(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s.slice(0, 500) : null;
}

/**
 * POST /api/loyalty/redeem
 * Redeem loyalty points into store credit dollars (manual redemption).
 *
 * Body:
 *  { "points": 200, "note": "Apply to next order" }
 *
 * Rules:
 *  - points must be >= LOYALTY.REDEEM_MIN_POINTS
 *  - points must be a multiple of LOYALTY.REDEEM_INCREMENT
 *  - user must have sufficient balance
 *  - optimistic guard prevents race conditions (gte on pointsBalance)
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return jsonError(401, "unauthorized");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const rawPoints = toPositiveInt(body?.points ?? 0);
  const note = toNote(body?.note);

  const min = Number(LOYALTY.REDEEM_MIN_POINTS ?? 0);
  const step = Number(LOYALTY.REDEEM_INCREMENT ?? 0);

  const isValidStep = step > 0 && Number.isFinite(rawPoints) && rawPoints % step === 0;

  if (!Number.isFinite(rawPoints) || rawPoints < min || !isValidStep) {
    return jsonError(400, "invalid_points", {
      message: `Invalid points. Min ${min}, multiples of ${step}.`,
      min,
      step,
    });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(loyaltyWallets)
        .where(eq(loyaltyWallets.customerId, userId))
        .limit(1);

      if (!wallet) {
        return { status: 404, json: { ok: false, error: "wallet_not_found" } };
      }

      const balance = Number(wallet.pointsBalance ?? 0);
      if (!Number.isFinite(balance)) {
        return { status: 400, json: { ok: false, error: "invalid_balance" } };
      }

      const newBalance = balance - rawPoints;
      if (newBalance < 0) {
        return { status: 400, json: { ok: false, error: "insufficient_points" } };
      }

      // Optimistic concurrency: only update if balance is still >= rawPoints
      const updatedRows = await tx
        .update(loyaltyWallets)
        .set({
          pointsBalance: newBalance,
          lifetimeRedeemed: Number(wallet.lifetimeRedeemed ?? 0) + rawPoints,
          updatedAt: new Date(),
        } as any)
        .where(
          and(eq(loyaltyWallets.id, wallet.id), gte(loyaltyWallets.pointsBalance, rawPoints))
        )
        .returning();

      if (!updatedRows || updatedRows.length === 0) {
        return { status: 409, json: { ok: false, error: "balance_changed_try_again" } };
      }

      await tx
        .insert(loyaltyTransactions)
        .values({
          customerId: userId,
          walletId: wallet.id,
          type: "redeem",
          // store deltas consistently: negative points for redemption
          points: -rawPoints,
          source: "manual",
          orderId: null,
          note,
          createdAt: new Date(),
        } as any);

      const credit = pointsToCreditDollars(rawPoints);
      const snapshot = computeLoyalty(newBalance);

      return {
        status: 200,
        json: {
          ok: true,
          redeemedPoints: rawPoints,
          credit,
          wallet: snapshot,
          balance: newBalance,
        },
      };
    });

    return NextResponse.json(result.json as any, { status: result.status });
  } catch (e: any) {
    console.error("POST /api/loyalty/redeem failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/** Guard other methods. */
export async function GET() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = GET;
export const DELETE = GET;
