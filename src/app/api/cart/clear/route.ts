// src/app/api/cart/clear/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/cart/clear
 *
 * Clears the client-side cart cache cookie (ADAP_CART_V1) and closes the server-side open cart.
 *
 * Notes:
 * - We mark the open cart as "submitted" (legacy behavior) so pricing/shipping snapshots remain immutable.
 * - If you later add a dedicated "abandoned" status, this is where you'd switch to it.
 * - This endpoint is idempotent: calling it multiple times is safe.
 */

const CLIENT_CART_COOKIE = "ADAP_CART_V1";

const CLIENT_COOKIE_OPTS = {
  httpOnly: false as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function ridFrom(req: NextRequest) {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

export async function POST(req: NextRequest) {
  const requestId = ridFrom(req);

  try {
    const jar = await getJar();
    const sid = jar.get?.("adap_sid")?.value ?? jar.get?.("sid")?.value ?? null;

    // Clear client cache cookie (non-httpOnly)
    // Keep the shape stable so client code can trust it.
    jar.set?.(CLIENT_CART_COOKIE, JSON.stringify({ updatedAt: Date.now(), lines: [] }), CLIENT_COOKIE_OPTS);

    if (sid) {
      const [cart] =
        (await db
          .select({ id: carts.id, status: (carts as any).status })
          .from(carts)
          .where(and(eq((carts as any).sid, sid), eq((carts as any).status, "open")))
          .limit(1)) ?? [];

      if (cart?.id) {
        await db
          .update(carts)
          .set({ status: "submitted" as any })
          .where(eq(carts.id, cart.id));
      }
    }

    return noStore(NextResponse.json({ ok: true, requestId }));
  } catch (e: any) {
    return noStore(
      NextResponse.json(
        { ok: false, requestId, error: String(e?.message || e) },
        { status: 500 }
      )
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = ridFrom(req);
  return noStore(NextResponse.json({ ok: false, requestId, error: "Method Not Allowed. Use POST." }, { status: 405 }));
}
