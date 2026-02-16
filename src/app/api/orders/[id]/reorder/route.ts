import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNotNull, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { orders } from "@/lib/db/schema/orders";
import { orderItems } from "@/lib/db/schema/orderItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(ok: boolean, body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok, ...body }, { status, headers: { "Cache-Control": "no-store" } });
}

function readSid(req: NextRequest): string {
  return (
    req.cookies.get("adap_sid")?.value ??
    req.cookies.get("sid")?.value ??
    req.headers.get("x-sid") ??
    ""
  ).trim();
}

type OrderRow = {
  id: string;
  userId: string;
  status: string;
  currency: string | null;
  cartId: string | null;
};

async function loadOrderWithAccess(req: NextRequest, orderId: string): Promise<OrderRow | null> {
  const { userId } = await auth();
  const sid = readSid(req);

  // No identity -> pretend not found (don’t leak existence)
  if (!userId && !sid) return null;

  if (userId) {
    const rows = await db
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        currency: orders.currency,
        cartId: orders.cartId,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);

    return rows?.[0] ?? null;
  }

  // Guest access: order must be linked to a cart, and that cart must match sid
  const rows = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      currency: orders.currency,
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

  return rows?.[0] ?? null;
}

async function ensureOpenCartForSid(sid: string, currency: "USD" | "CAD") {
  // Find existing open cart for this sid
  const existing = await db
    .select({ id: carts.id, currency: carts.currency })
    .from(carts)
    .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
    .limit(1);

  if (existing?.[0]) {
    // keep currency in sync with reorder currency (helps store selection)
    if ((existing[0].currency as any) !== currency) {
      await db.update(carts).set({ currency }).where(eq(carts.id, existing[0].id));
    }
    return existing[0].id as string;
  }

  const inserted = await db
    .insert(carts)
    .values({
      sid,
      status: "open",
      currency,
      selectedShipping: null, // SQL NULL (no JSON null default)
    })
    .returning({ id: carts.id });

  return inserted?.[0]?.id as string;
}

// POST /api/orders/:id/reorder
// Copies order_items into current open cart as new cart_lines rows.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const orderId = String(id || "").trim();
    if (!orderId) return json(false, { error: "missing_order_id" }, 400);

    const sid = readSid(req);
    if (!sid) return json(false, { error: "missing_sid" }, 400);

    const order = await loadOrderWithAccess(req, orderId);
    if (!order) return json(false, { error: "not_found" }, 404);

    // Load items
    const items = await db
      .select({
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        lineTotalCents: orderItems.lineTotalCents,
        optionIds: orderItems.optionIds,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    if (!items.length) {
      return json(false, { error: "no_items_to_reorder" }, 400);
    }

    const currency = (String(order.currency || "USD").toUpperCase() === "CAD" ? "CAD" : "USD") as "USD" | "CAD";

    // Ensure open cart for this session
    const cartId = await ensureOpenCartForSid(sid, currency);

    // Insert new cart lines (do NOT overwrite existing cart by default)
    const values = items.map((it) => {
      const qty = Math.max(1, Number(it.quantity || 1));
      const unitCents = Number(it.unitPriceCents || 0);
      const lineCents =
        Number.isFinite(Number(it.lineTotalCents)) && Number(it.lineTotalCents) >= 0
          ? Number(it.lineTotalCents)
          : qty * unitCents;

      return {
        cartId,
        productId: Number(it.productId),
        quantity: qty,
        unitPriceCents: Math.max(0, Math.trunc(unitCents)),
        lineTotalCents: Math.max(0, Math.trunc(lineCents)),
        optionIds: (it.optionIds as unknown as number[]) ?? [],
        artwork: [],
        currency,
      };
    });

    await db.insert(cartLines).values(values);

    return json(true, {
      cartId,
      added: values.length,
      redirect: "/cart",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/orders/[id]/reorder] POST error:", msg);
    return json(false, { error: "reorder_failed", detail: msg }, 500);
  }
}
