// src/app/api/cart/lines/[lineId]/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SID_COOKIE = "sid";

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Next 14 (sync) + Next 15 (async) cookie helper
async function getCookieJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function clampQty(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null; // NaN/Infinity => reject
  const m = Math.floor(n);
  if (!Number.isFinite(m)) return null;
  return Math.max(1, Math.min(9999, m));
}

async function getSid(): Promise<string> {
  const jar = await getCookieJar();
  // accept both keys, prefer "sid"
  return jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
}

async function getOpenCartForSid(sid: string) {
  if (!sid) return null;
  return db.query.carts.findFirst({
    where: and(eq(carts.sid, sid), eq(carts.status, "open")),
    columns: { id: true, sid: true, status: true },
  });
}

/**
 * DELETE /api/cart/lines/[lineId]
 * Removes a single line item from the user's open cart (scoped to sid cookie).
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ lineId: string }> },
) {
  try {
    const { lineId } = await ctx.params;

    if (!lineId || typeof lineId !== "string") {
      return noStore(NextResponse.json({ ok: false, error: "Missing or invalid lineId" }, { status: 400 }));
    }

    const sid = await getSid();
    if (!sid) {
      return noStore(NextResponse.json({ ok: false, error: "Missing session" }, { status: 401 }));
    }

    const cart = await getOpenCartForSid(sid);
    if (!cart) {
      return noStore(NextResponse.json({ ok: false, error: "Open cart not found" }, { status: 404 }));
    }

    const [deleted] = await db
      .delete(cartLines)
      .where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)))
      .returning({ id: cartLines.id, cartId: cartLines.cartId });

    if (!deleted) {
      return noStore(NextResponse.json({ ok: false, error: "Line not found" }, { status: 404 }));
    }

    return noStore(
      NextResponse.json(
        { ok: true, removedLineId: deleted.id, cartId: deleted.cartId, message: "Cart line removed" },
        { status: 200 },
      ),
    );
  } catch (err) {
    console.error("DELETE /api/cart/lines/[lineId] failed:", err);
    return noStore(NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 }));
  }
}

/**
 * PATCH /api/cart/lines/[lineId]
 * Updates quantity for a cart line (scoped to sid cookie).
 *
 * Body: { quantity: number }
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ lineId: string }> },
) {
  try {
    const { lineId } = await ctx.params;

    if (!lineId || typeof lineId !== "string") {
      return noStore(NextResponse.json({ ok: false, error: "Missing or invalid lineId" }, { status: 400 }));
    }

    const sid = await getSid();
    if (!sid) {
      return noStore(NextResponse.json({ ok: false, error: "Missing session" }, { status: 401 }));
    }

    const cart = await getOpenCartForSid(sid);
    if (!cart) {
      return noStore(NextResponse.json({ ok: false, error: "Open cart not found" }, { status: 404 }));
    }

    const body = (await req.json().catch(() => ({}))) as { quantity?: unknown };
    const nextQty = clampQty(body.quantity);

    // ✅ server-side NaN defense
    if (nextQty == null) {
      return noStore(NextResponse.json({ ok: false, error: "invalid_quantity" }, { status: 400 }));
    }

    // Update only if this line belongs to this cart
    const [updated] = await db
      .update(cartLines)
      .set({
        quantity: nextQty as any,
        updatedAt: new Date(),
        // NOTE: We do NOT recompute price here.
        // If you want totals synced, call /api/cart/lines/reprice (but secure that too; see below).
      })
      .where(and(eq(cartLines.id, lineId), eq(cartLines.cartId, cart.id)))
      .returning({
        id: cartLines.id,
        cartId: cartLines.cartId,
        quantity: cartLines.quantity,
      });

    if (!updated) {
      return noStore(NextResponse.json({ ok: false, error: "Line not found" }, { status: 404 }));
    }

    return noStore(NextResponse.json({ ok: true, line: updated }, { status: 200 }));
  } catch (err) {
    console.error("PATCH /api/cart/lines/[lineId] failed:", err);
    return noStore(NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 }));
  }
}
