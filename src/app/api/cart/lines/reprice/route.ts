// src/app/api/cart/lines/reprice/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { carts, cartLines } from "@/lib/db/schema";
import { priceSinaliteProduct } from "@/lib/sinalite.pricing";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { cartId?: string };

    const jar = await getJar();
    const sid = jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
    if (!sid) return noStore(NextResponse.json({ ok: false, error: "No session" }, { status: 401 }));

    // If cartId provided, we still validate it belongs to sid
    const cartId = typeof body.cartId === "string" && body.cartId ? body.cartId : null;

    const cart = await db.query.carts.findFirst({
      where: cartId
        ? and(eq(carts.id, cartId), eq(carts.sid, sid), eq(carts.status, "open"))
        : and(eq(carts.sid, sid), eq(carts.status, "open")),
    });

    if (!cart) {
      return noStore(NextResponse.json({ ok: false, error: "cart not found" }, { status: 404 }));
    }

    const lines = await db.query.cartLines.findMany({
      where: eq(cartLines.cartId, cart.id),
    });

    const store = cart.currency === "CAD" ? "CA" : "US";

    for (const l of lines) {
      const qty = Math.max(1, Number(l.quantity) || 1);

      const priced = await priceSinaliteProduct({
        productId: Number(l.productId),
        optionIds: Array.isArray((l as any).optionIds) ? (l as any).optionIds.map(Number) : [],
        store,
      });

      const total =
        Number((priced as any)?.lineTotal) ||
        Number((priced as any)?.total) ||
        Number((priced as any)?.price) ||
        Number((priced as any)?.unitPrice) ||
        0;

      const lineTotalCents = Number.isFinite(total) && total > 0 ? Math.round(total * 100) : 0;
      const unitPriceCents = lineTotalCents > 0 ? Math.round(lineTotalCents / Math.max(1, qty)) : 0;

      await db
        .update(cartLines)
        .set({
          unitPriceCents,
          lineTotalCents,
          updatedAt: new Date(),
        })
        .where(and(eq(cartLines.id, l.id), eq(cartLines.cartId, cart.id)));
    }

    return noStore(NextResponse.json({ ok: true, count: lines.length }, { status: 200 }));
  } catch (err: any) {
    return noStore(
      NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 }),
    );
  }
}
