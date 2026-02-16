import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, isNotNull, ne, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { carts } from "@/lib/db/schema/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(ok: boolean, body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok, ...body }, { status, headers: { "Cache-Control": "no-store" } });
}

function dollars(cents: number) {
  const n = Number(cents || 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

function readSid(req: NextRequest): string {
  return (
    req.cookies.get("adap_sid")?.value ??
    req.cookies.get("sid")?.value ??
    req.headers.get("x-sid") ??
    ""
  ).trim();
}

// GET /api/orders
// - If logged in: list by orders.userId
// - If guest: list by carts.sid (join on orders.cartId)
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    const sid = readSid(req);

    // No identity at all -> empty list (not an error)
    if (!userId && !sid) {
      return json(true, { orders: [] });
    }

    // Query params
    const sp = new URL(req.url).searchParams;
    const limit = Math.max(1, Math.min(50, Number(sp.get("limit") ?? 20) || 20));

    // Logged-in: strict owner match
    if (userId) {
      const rows = await db
        .select({
          id: orders.id,
          status: orders.status,
          createdAt: orders.createdAt,
          placedAt: orders.placedAt,
          currency: orders.currency,
          subtotalCents: orders.subtotalCents,
          shippingCents: orders.shippingCents,
          taxCents: orders.taxCents,
          creditsCents: orders.creditsCents,
          totalCents: orders.totalCents,
          provider: orders.provider,
          providerId: orders.providerId,
          paymentStatus: orders.paymentStatus,
          cartId: orders.cartId,
        })
        .from(orders)
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.createdAt))
        .limit(limit);

      return json(true, {
        orders: rows.map((o) => ({
          ...o,
          currency: (o.currency || "USD") as "USD" | "CAD",
          subtotal: dollars(o.subtotalCents),
          shipping: dollars(o.shippingCents),
          tax: dollars(o.taxCents),
          credits: dollars(o.creditsCents ?? 0),
          total: dollars(o.totalCents),
        })),
      });
    }

    // Guest: must have sid; only orders that are linked to a cart
    const rows = await db
      .select({
        id: orders.id,
        status: orders.status,
        createdAt: orders.createdAt,
        placedAt: orders.placedAt,
        currency: orders.currency,
        subtotalCents: orders.subtotalCents,
        shippingCents: orders.shippingCents,
        taxCents: orders.taxCents,
        creditsCents: orders.creditsCents,
        totalCents: orders.totalCents,
        provider: orders.provider,
        providerId: orders.providerId,
        paymentStatus: orders.paymentStatus,
        cartId: orders.cartId,
      })
      .from(orders)
      .innerJoin(carts, eq(carts.id, orders.cartId))
      .where(
        and(
          eq(carts.sid, sid),
          // defensive: only show "real" orders
          ne(orders.status, "draft"),
          isNotNull(orders.cartId),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    return json(true, {
      orders: rows.map((o) => ({
        ...o,
        currency: (o.currency || "USD") as "USD" | "CAD",
        subtotal: dollars(o.subtotalCents),
        shipping: dollars(o.shippingCents),
        tax: dollars(o.taxCents),
        credits: dollars(o.creditsCents ?? 0),
        total: dollars(o.totalCents),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/orders] GET error:", msg);
    return json(false, { error: "orders_list_failed", detail: msg }, 500);
  }
}
