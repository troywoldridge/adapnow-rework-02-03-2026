import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartCredits } from "@/lib/db/schema/cartCredits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSidFromCookies(): string {
  const jar = cookies();
  return jar.get("sid")?.value ?? jar.get("adap_sid")?.value ?? "";
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// shipping is stored as dollars in selectedShipping.cost (per your UI)
function shippingCentsFromSelectedShipping(selectedShipping: unknown): number {
  const s = selectedShipping as any;
  const dollars = Number(s?.cost ?? 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

async function getOpenCartBySid(sid: string) {
  const [cart] = await db
    .select({
      id: carts.id,
      currency: carts.currency,
      selectedShipping: carts.selectedShipping,
    })
    .from(carts)
    .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
    .limit(1);

  return cart ?? null;
}

async function subtotalCentsForCart(cartId: string): Promise<number> {
  const rows = await db
    .select({
      quantity: cartLines.quantity,
      unitPriceCents: cartLines.unitPriceCents,
      lineTotalCents: cartLines.lineTotalCents,
    })
    .from(cartLines)
    .where(eq(cartLines.cartId, cartId));

  const subtotal = rows.reduce((sum, r) => {
    const qty = toInt(r.quantity, 0);
    const unit = toInt(r.unitPriceCents, 0);
    const line = Number.isFinite(Number(r.lineTotalCents))
      ? toInt(r.lineTotalCents, qty * unit)
      : qty * unit;
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);

  return Math.max(0, subtotal);
}

async function replaceLoyaltyCredit(cartId: string, amountCents: number) {
  // Make it deterministic: one row for reason='loyalty'
  await db.delete(cartCredits).where(and(eq(cartCredits.cartId, cartId), eq(cartCredits.reason, "loyalty")));

  if (amountCents > 0) {
    await db.insert(cartCredits).values({
      cartId,
      amountCents,
      reason: "loyalty",
      note: "Applied by customer",
    });
  }

  const [row] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${cartCredits.amountCents}), 0)`,
    })
    .from(cartCredits)
    .where(eq(cartCredits.cartId, cartId));

  const n = Number(row?.sum ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const sid = getSidFromCookies();
    if (!sid) return NextResponse.json({ ok: false, error: "No session/cart." }, { status: 400 });

    const cart = await getOpenCartBySid(sid);
    if (!cart) return NextResponse.json({ ok: false, error: "Cart not found." }, { status: 404 });

    const body = await req.json().catch(() => ({} as any));
    const requestedCents = Math.max(0, toInt(body?.creditsCents ?? body?.amountCents ?? body?.cents ?? 0, 0));

    const subtotalCents = await subtotalCentsForCart(cart.id);
    const shippingCents = shippingCentsFromSelectedShipping(cart.selectedShipping);
    const taxCents = 0; // keep 0 until your tax module is wired in Phase 2

    // clamp to (subtotal + shipping + tax)
    const maxCents = Math.max(0, subtotalCents + shippingCents + taxCents);
    const appliedCents = Math.min(requestedCents, maxCents);

    const creditsCents = await replaceLoyaltyCredit(cart.id, appliedCents);

    return NextResponse.json({
      ok: true,
      cartId: cart.id,
      subtotalCents,
      shippingCents,
      taxCents,
      creditsCents,
      currency: (cart.currency as "USD" | "CAD") ?? "USD",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
