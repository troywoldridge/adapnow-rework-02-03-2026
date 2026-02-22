import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartCredits } from "@/lib/db/schema/cartCredits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSidFromRequest(req: NextRequest): string {
  return req.cookies.get("sid")?.value ?? req.cookies.get("adap_sid")?.value ?? "";
}

async function getOpenCartBySid(sid: string) {
  const [cart] = await db
    .select({ id: carts.id, currency: carts.currency })
    .from(carts)
    .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
    .limit(1);

  return cart ?? null;
}

async function sumCreditsCents(cartId: string): Promise<number> {
  const [row] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${cartCredits.amountCents}), 0)`,
    })
    .from(cartCredits)
    .where(eq(cartCredits.cartId, cartId));

  const n = Number(row?.sum ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export async function GET(req: NextRequest) {
  try {
    const sid = getSidFromRequest(req);

    // If no sid, treat as "no cart yet" (ok=true, 0 credits)
    if (!sid) {
      return NextResponse.json({ ok: true, cartId: null, creditsCents: 0 }, { status: 200 });
    }

    const cart = await getOpenCartBySid(sid);
    if (!cart) {
      return NextResponse.json({ ok: true, cartId: null, creditsCents: 0 }, { status: 200 });
    }

    const creditsCents = await sumCreditsCents(cart.id);

    return NextResponse.json({
      ok: true,
      cartId: cart.id,
      creditsCents,
      currency: (cart.currency as "USD" | "CAD") ?? "USD",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
