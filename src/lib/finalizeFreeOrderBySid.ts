import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartCredits } from "@/lib/db/schema/cartCredits";
import { orders } from "@/lib/db/schema/orders";
import { getCartCreditsCents } from "@/lib/cartCredits";
import { cartLines } from "@/lib/db/schema/cartLines";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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
  // selectedShipping is typically JSON with cost in dollars (but we accept cents too).
  const s = selectedShipping as Record<string, unknown> | null | undefined;

  const raw =
    (s?.cost as unknown) ??
    (s?.price as unknown) ??
    (s?.rate && typeof s.rate === "object" ? (s.rate as any).cost : undefined) ??
    0;

  // If cost is something like "12.34" dollars
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;

  // Heuristic: if it looks like cents already (>= 1000), treat as cents.
  // Otherwise treat as dollars.
  if (Number.isInteger(n) && n >= 1000) return n;

  return Math.round(n * 100);
}

/**
 * Compute subtotal in cents from cart_lines.
 * Prefer SQL SUM(qty * unitPrice) but fall back to lineTotalCents when present.
 */
async function computeCartSubtotalCents(cartId: string, tx?: Tx): Promise<number> {
  const database = tx ?? db;

  // Prefer lineTotalCents when it's present; otherwise use quantity * unitPriceCents.
  // COALESCE(SUM(COALESCE(line_total_cents, quantity*unit_price_cents)), 0)
  const rows = await database
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

  // Find open cart for sid (anything not closed)
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

  // Tax is handled elsewhere; stay conservative here.
  const taxCents = 0;

  const totalCents = Math.max(0, subtotalCents + shipCents + taxCents - creditsCents);

  // Optional safety check if upstream computed totals
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
        status: "placed",
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

    // Close cart and claim it
    await tx
      .update(carts)
      .set({ status: "closed", userId: safeUserId, updatedAt: sql`now()` })
      .where(eq(carts.id, cart.id));

    // Consume credits
    await tx.delete(cartCredits).where(eq(cartCredits.cartId, cart.id));

    return String(order.id);
  });

  return orderId;
}
