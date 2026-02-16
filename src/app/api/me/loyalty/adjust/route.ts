import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { loyaltyTransactions, loyaltyWallets } from "@/lib/db/schema/loyalty";
import { computeLoyalty } from "@/lib/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function toInt(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return NaN;
  // accept integer-ish inputs but always clamp to int toward 0
  return Math.trunc(n);
}

function toNote(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s.slice(0, 500) : null; // prevent absurd payloads
}

/**
 * POST /api/loyalty/adjust
 * Adjust loyalty points for the authenticated user.
 *
 * Body:
 *  { "points": 25, "note": "Manual credit" }   // + earns
 *  { "points": -10, "note": "Correction" }    // - redeems
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

  const points = toInt(body?.points ?? 0); // can be + or -
  const note = toNote(body?.note);

  if (!Number.isFinite(points) || points === 0) {
    return jsonError(400, "invalid_points", { hint: "Provide a non-zero integer points value" });
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

      const current = Number(wallet.pointsBalance ?? 0);
      const newBalance = current + points;

      if (!Number.isFinite(newBalance)) {
        return { status: 400, json: { ok: false, error: "invalid_balance" } };
      }
      if (newBalance < 0) {
        return { status: 400, json: { ok: false, error: "insufficient_balance" } };
      }

      // Keep lifetime counters monotonic
      const lifetimeEarned = Number(wallet.lifetimeEarned ?? 0) + Math.max(points, 0);
      const lifetimeRedeemed = Number(wallet.lifetimeRedeemed ?? 0) + Math.max(-points, 0);

      await tx
        .update(loyaltyWallets)
        .set({
          pointsBalance: newBalance,
          lifetimeEarned,
          lifetimeRedeemed,
          updatedAt: new Date(),
        } as any)
        .where(eq(loyaltyWallets.id, wallet.id));

      await tx
        .insert(loyaltyTransactions)
        .values({
          customerId: userId,
          walletId: wallet.id,
          type: "adjust",
          points, // + or -
          source: "admin",
          orderId: null,
          note,
          createdAt: new Date(),
        } as any);

      return {
        status: 200,
        json: {
          ok: true,
          wallet: computeLoyalty(newBalance),
          balance: newBalance,
        },
      };
    });

    return NextResponse.json(result.json as any, { status: result.status });
  } catch (e: any) {
    console.error("POST /api/loyalty/adjust failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/**
 * Guard other methods.
 */
export async function GET() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = GET;
export const DELETE = GET;
