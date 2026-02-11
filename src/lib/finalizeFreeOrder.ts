import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartCredits } from "@/lib/db/schema/cartCredits";
import { orders } from "@/lib/db/schema/orders";
import { getCartCreditsCents } from "@/lib/cartCredits";

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeCurrency(v: unknown): "USD" | "CAD" {
  const s = clean(v).toUpperCase();
  return s === "CAD" ? "CAD" : "USD";
}

function shipCentsFromSelectedShipping(selectedShipping: unknown): number {
  // selectedShipping is usually JSON (cost in dollars)
  const anyShip = selectedShipping as Record<string, unknown> | null | undefined;

  const raw =
    (anyShip?.cost as unknown) ??
    (anyShip?.price as unknown) ??
    (anyShip?.rate && typeof anyShip.rate === "object" ? (anyShip.rate as any).cost : undefined) ??
    0;

  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;

  // Heuristic: if it looks like cents already, treat as cents
  if (Number.isInteger(n) && n >= 1000) return n;

  // Otherwise assume dollars
  return Math.round(n * 100);
}

async function computeCartSubtotalCents(cartId: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`
        COALESCE(
          SUM(
            COALESCE(${cartLines.lineTotalCents}, (${cartLines.quantity} * ${cartLines.unitPriceCents}))
          ),
          0
        )
      `,
    })
    .from(cartLines)
    .where(eq(cartLines.cartId, cartId))
    .limit(1);

  const total = rows[0]?.total ?? 0;
  return Number.isFinite(total) ? toInt(total, 0) : 0;
}

/**
 * Finalize a $0 checkout (credits cover entire total) by SID.
 * Used when you don't want to create a Stripe PaymentIntent.
 *
 * Returns orderId when finalized, otherwise null (not free or no open cart).
 */
export async function finalizeFreeOrderBySid(args: {
  sid: string;
  expectedTotalCents?: number | null;
  userId?: string | null;
}): Promise<string | null> {
  const sid = clean(args.sid);
  if (!sid) return null;

  // Find open cart for sid
  const [cart] = await db
    .select({
      id: carts.id,
      sid: carts.sid,
      userId: carts.userId,
      status: carts.status,
      currency: carts.currency,
      selectedShipping: carts.selectedShipping,
    })
    .from(carts)
    .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
    .limit(1);

  if (!cart) return null;

  const shipCents = shipCentsFromSelectedShipping(cart.selectedShipping);
  const subtotalCents = await computeCartSubtotalCents(cart.id);
  const creditsCents = await getCartCreditsCents(cart.id);

  // Tax handled elsewhere; conservative here
  const taxCents = 0;

  const totalCents = Math.max(0, subtotalCents + shipCents + taxCents - creditsCents);

  if (typeof args.expectedTotalCents === "number" && args.expectedTotalCents >= 0) {
    if (totalCents !== args.expectedTotalCents && totalCents > 0) return null;
  }

  // Only finalize if truly free
  if (totalCents > 0) return null;

  const safeUserId = clean(args.userId) || clean(cart.userId) || clean(cart.sid);
  const currency = normalizeCurrency(cart.currency);

  const orderId = await db.transaction(async (tx) => {
    // Idempotency: if an order already exists for this cart, reuse it
    const existing = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.cartId, cart.id))
      .limit(1);

    if (existing[0]?.id) return String(existing[0].id);

    const [order] = await tx
      .insert(orders)
      .values({
        userId: safeUserId,

        cartId: cart.id,

        // Your schema defaults status to "draft", but we want this to be “placed/paid”.
        // Keep it simple and explicit.
        status: "paid",
        paymentStatus: "paid",

        provider: "free",
        providerId: null,

        currency,

        subtotalCents,
        shippingCents: shipCents,
        taxCents,
        discountCents: creditsCents,
        creditsCents,
        totalCents,

        placedAt: sql`now()`,
      })
      .returning({ id: orders.id });

    await tx
      .update(carts)
      .set({ status: "closed", userId: safeUserId })
      .where(eq(carts.id, cart.id));

    await tx.delete(cartCredits).where(eq(cartCredits.cartId, cart.id));

    return String(order.id);
  });

  return orderId;
}
