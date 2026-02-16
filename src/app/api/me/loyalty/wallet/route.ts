// src/app/api/loyalty/wallet/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/customer";
import { loyaltyWallets } from "@/lib/db/schema/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/loyalty/wallet
 *
 * Ensures:
 * - Signed-in user exists (Clerk).
 * - Customer row exists for clerkUserId (creates if missing).
 * - Loyalty wallet exists for customerId (creates if missing).
 *
 * Returns:
 * { ok: true, requestId, balance, customerId }
 *
 * Future-proof upgrades:
 * - requestId in response + header.
 * - no-store headers (wallet data is personalized).
 * - Centralized email normalization.
 * - Defensive numeric coercion for pointsBalance.
 */

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function cleanEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  // minimal sanity
  if (!s.includes("@") || s.startsWith("@") || s.endsWith("@")) return null;
  if (s.length > 320) return null;
  return s;
}

function toIntSafe(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const { userId } = await auth();
    if (!userId) {
      return noStoreJson(req, { ok: false as const, requestId, error: "unauthorized" }, 401);
    }

    const user = await currentUser().catch(() => null);
    const email =
      cleanEmail(user?.primaryEmailAddress?.emailAddress) ||
      cleanEmail(user?.emailAddresses?.[0]?.emailAddress) ||
      null;

    // Find customer by Clerk userId
    let cust =
      (await db
        .select()
        .from(customers)
        .where(eq(customers.clerkUserId, userId))
        .limit(1))?.[0] ?? null;

    if (!cust) {
      if (!email) {
        return noStoreJson(req, { ok: false as const, requestId, error: "no_email" }, 400);
      }

      const inserted = await db
        .insert(customers)
        .values({
          clerkUserId: userId,
          email,
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
        } as any)
        .returning();

      cust = inserted?.[0] ?? null;

      if (!cust) {
        return noStoreJson(req, { ok: false as const, requestId, error: "customer_create_failed" }, 500);
      }
    } else if (!(cust as any).email && email) {
      await db.update(customers).set({ email } as any).where(eq(customers.id, cust.id));
      (cust as any).email = email;
    }

    // Find wallet by customerId
    let wallet =
      (await db
        .select()
        .from(loyaltyWallets)
        .where(eq(loyaltyWallets.customerId, cust.id))
        .limit(1))?.[0] ?? null;

    if (!wallet) {
      const insertedWallet = await db
        .insert(loyaltyWallets)
        .values({
          customerId: cust.id,
          pointsBalance: 0 as any,
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
        } as any)
        .returning();

      wallet = insertedWallet?.[0] ?? null;

      if (!wallet) {
        return noStoreJson(req, { ok: false as const, requestId, error: "wallet_create_failed" }, 500);
      }
    }

    const balance = toIntSafe((wallet as any)?.pointsBalance, 0);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      customerId: cust.id,
      balance,
    });
  } catch (e: any) {
    console.error("[/api/loyalty/wallet GET]", e?.message || e);
    return noStoreJson(req, { ok: false as const, requestId, error: "internal_error" }, 500);
  }
}

export async function POST(req: NextRequest) {
  // Wallet is read-only here; adjustments should go through admin/loyalty/adjust.
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}

export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}
