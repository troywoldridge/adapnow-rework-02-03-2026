// src/app/api/cart/lines/ensure/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ------------------------- constants ------------------------- */

const COOKIE_PRIMARY = "adap_sid";
const COOKIE_FALLBACK = "sid";

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

/* -------------------------- helpers -------------------------- */

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function toInt(u: unknown, fallback = 0) {
  const n = Number(u);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function setSidCookies(res: NextResponse, sid: string) {
  // Keep both cookie names in sync for legacy + new code paths
  res.cookies.set(COOKIE_PRIMARY, sid, COOKIE_OPTS);
  res.cookies.set(COOKIE_FALLBACK, sid, COOKIE_OPTS);
}

async function readOrCreateSid(): Promise<{ sid: string; created: boolean }> {
  const jar = await getJar();
  const existing =
    jar.get?.(COOKIE_PRIMARY)?.value ?? jar.get?.(COOKIE_FALLBACK)?.value ?? null;

  if (existing && String(existing).trim()) {
    return { sid: String(existing).trim(), created: false };
  }
  return { sid: crypto.randomUUID(), created: true };
}

async function ensureCartIdForSid(sid: string): Promise<string> {
  // Find open cart
  const found = await db.query.carts.findFirst({
    where: and(eq(carts.sid, sid), eq(carts.status, "open")),
  });
  if (found?.id) return String(found.id);

  // Create new cart
  const [row] = await db
    .insert(carts)
    .values({
      sid,
      status: "open",
      // Be conservative; add-to-cart sets correct currency later
      currency: (carts as any).currency ? ("USD" as any) : undefined,
    } as any)
    .returning({ id: carts.id });

  return String(row.id);
}

/**
 * Ensure a cart line exists for productId.
 *
 * ⚠️ IMPORTANT for future-proofing:
 * Today this endpoint merges lines ONLY by (cartId, productId).
 * If/when you support variants, you must include optionIds/optionChain/hash in the match key.
 */
async function ensureLine(cartId: string, input: { productId: number; qty?: number }) {
  const productId = toInt(input.productId, 0);
  const qty = Math.max(1, toInt(input.qty, 1));

  if (!productId) return { ok: false as const, error: "missing_productId" };

  const existing = await db.query.cartLines.findFirst({
    where: and(eq(cartLines.cartId, cartId), eq(cartLines.productId, productId)),
  });

  if (existing) {
    const currentQty = Math.max(1, toInt((existing as any).quantity ?? 1, 1));
    const newQty = currentQty + qty;

    const [updated] = await db
      .update(cartLines)
      .set({
        quantity: newQty as any,
        updatedAt: (cartLines as any).updatedAt ? sql`now()` : undefined,
      } as any)
      .where(eq(cartLines.id, existing.id))
      .returning({ id: cartLines.id, quantity: (cartLines as any).quantity });

    return {
      ok: true as const,
      cartId,
      lineId: String(updated.id),
      quantity: toInt((updated as any).quantity, newQty),
      merged: true as const,
    };
  }

  const [inserted] = await db
    .insert(cartLines)
    .values({
      cartId,
      productId,
      quantity: qty,
    } as any)
    .returning({ id: cartLines.id, quantity: (cartLines as any).quantity });

  return {
    ok: true as const,
    cartId,
    lineId: String(inserted.id),
    quantity: toInt((inserted as any).quantity, qty),
    merged: false as const,
  };
}

function parseEnsureFromUrl(req: NextRequest) {
  const url = new URL(req.url);
  const productId = toInt(url.searchParams.get("productId"));
  const qty = toInt(url.searchParams.get("qty"), 1);
  return { productId, qty };
}

/* -------------------------- handlers -------------------------- */

export async function GET(req: NextRequest) {
  // GET supported for convenience (links, quick testing)
  try {
    const { productId, qty } = parseEnsureFromUrl(req);

    const { sid, created } = await readOrCreateSid();
    const cartId = await ensureCartIdForSid(sid);
    const result = await ensureLine(cartId, { productId, qty });

    const res = NextResponse.json(result, { status: result.ok ? 200 : 400 });
    if (created) setSidCookies(res, sid);
    return noStore(res);
  } catch (err: any) {
    console.error("[/api/cart/lines/ensure GET] error:", err);
    return noStore(
      NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const productId = toInt(body?.productId);
    const qty = toInt(body?.qty, 1);

    const { sid, created } = await readOrCreateSid();
    const cartId = await ensureCartIdForSid(sid);
    const result = await ensureLine(cartId, { productId, qty });

    const res = NextResponse.json(result, { status: result.ok ? 200 : 400 });
    if (created) setSidCookies(res, sid);
    return noStore(res);
  } catch (err: any) {
    console.error("[/api/cart/lines/ensure POST] error:", err);
    return noStore(
      NextResponse.json({ ok: false, error: "server_error" }, { status: 500 })
    );
  }
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "cache-control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}
