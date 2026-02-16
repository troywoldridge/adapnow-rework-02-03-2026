import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNotNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { orderItems } from "@/lib/db/schema/orderItems";
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

// GET /api/orders/:id
// - If logged in: must match orders.userId
// - If guest: must match carts.sid via orders.cartId join
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const orderId = String(id || "").trim();
    if (!orderId) return json(false, { error: "missing_order_id" }, 400);

    const { userId } = await auth();
    const sid = readSid(req);

    // No identity -> 404 (avoid leaking existence)
    if (!userId && !sid) return json(false, { error: "not_found" }, 404);

    // Load order with access gate
    let orderRow:
      | {
          id: string;
          userId: string;
          status: string;
          createdAt: Date;
          updatedAt: Date;
          placedAt: Date | null;
          currency: string | null;
          subtotalCents: number;
          shippingCents: number;
          taxCents: number;
          creditsCents: number | null;
          totalCents: number;
          provider: string | null;
          providerId: string | null;
          paymentStatus: string | null;
          cartId: string | null;
        }
      | null = null;

    if (userId) {
      const rows = await db
        .select({
          id: orders.id,
          userId: orders.userId,
          status: orders.status,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
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
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
        .limit(1);

      orderRow = rows?.[0] ?? null;
    } else {
      // guest path: join carts to enforce sid ownership
      const rows = await db
        .select({
          id: orders.id,
          userId: orders.userId,
          status: orders.status,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
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
            eq(orders.id, orderId),
            eq(carts.sid, sid),
            ne(orders.status, "draft"),
            isNotNull(orders.cartId),
          ),
        )
        .limit(1);

      orderRow = rows?.[0] ?? null;
    }

    if (!orderRow) return json(false, { error: "not_found" }, 404);

    // Load items (allowed if order allowed)
    const items = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        lineTotalCents: orderItems.lineTotalCents,
        optionIds: orderItems.optionIds,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderRow.id));

    const currency = (String(orderRow.currency || "USD").toUpperCase() === "CAD" ? "CAD" : "USD") as "USD" | "CAD";
    const creditsCents = Number(orderRow.creditsCents || 0);

    return json(true, {
      order: {
        ...orderRow,
        currency,
        subtotal: dollars(orderRow.subtotalCents),
        shipping: dollars(orderRow.shippingCents),
        tax: dollars(orderRow.taxCents),
        credits: dollars(creditsCents),
        total: dollars(orderRow.totalCents),
      },
      items: items.map((it) => ({
        ...it,
        unitPrice: dollars(it.unitPriceCents),
        lineTotal: dollars(it.lineTotalCents),
        optionIds: (it.optionIds as unknown as number[]) ?? [],
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/orders/[id]] GET error:", msg);
    return json(false, { error: "order_get_failed", detail: msg }, 500);
  }
}
