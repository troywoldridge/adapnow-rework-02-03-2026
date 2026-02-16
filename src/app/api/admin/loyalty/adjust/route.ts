import "server-only";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { loyaltyTransactions, loyaltyWallets } from "@/lib/db/schema/loyalty";
import { computeLoyalty } from "@/lib/loyalty";
import { requireAdmin } from "@/lib/authz";

type AdjustRequest = {
  targetUserId?: unknown;
  points?: unknown;
  note?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // keep notes sane for admin audits/logs
  return t.length > 500 ? t.slice(0, 500) : t;
}

function safeInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  // Guard against absurd deltas (accidents)
  if (i === 0) return null;
  if (Math.abs(i) > 1_000_000) return null;
  return i;
}

export async function POST(req: Request) {
  const database = db;

  try {
    await requireAdmin();

    let raw: AdjustRequest;
    try {
      raw = (await req.json()) as AdjustRequest;
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const targetUserId = safeString(raw.targetUserId);
    const points = safeInt(raw.points);
    const note = safeNote(raw.note);

    if (!targetUserId || points === null) {
      return jsonError("Invalid request", 400);
    }

    const result = await database.transaction(async (tx) => {
      let wallet = await tx.query.loyaltyWallets.findFirst({
        where: eq(loyaltyWallets.customerId, targetUserId),
      });

      if (!wallet) {
        const inserted = await tx
          .insert(loyaltyWallets)
          .values({ customerId: targetUserId })
          .returning();
        wallet = inserted[0] ?? null;
      }

      if (!wallet) {
        return { status: 500 as const, json: { ok: false, error: "Failed to create wallet" } };
      }

      const newBalance = (wallet.pointsBalance ?? 0) + points;
      if (newBalance < 0) {
        return { status: 400 as const, json: { ok: false, error: "Insufficient balance" } };
      }

      await tx
        .update(loyaltyWallets)
        .set({
          pointsBalance: newBalance,
          lifetimeEarned: (wallet.lifetimeEarned ?? 0) + Math.max(points, 0),
          lifetimeRedeemed: (wallet.lifetimeRedeemed ?? 0) + Math.max(-points, 0),
          updatedAt: new Date(),
        })
        .where(eq(loyaltyWallets.id, wallet.id));

      await tx.insert(loyaltyTransactions).values({
        customerId: targetUserId,
        walletId: wallet.id,
        delta: points,
        reason: "adjustment",
        orderId: null,
        note,
        createdAt: new Date(),
      });

      return {
        status: 200 as const,
        json: {
          ok: true,
          wallet: computeLoyalty(newBalance),
        },
      };
    });

    return NextResponse.json(result.json, { status: result.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
