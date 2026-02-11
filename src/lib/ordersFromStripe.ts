import "server-only";

import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts, cartLines, orders, orderItems } from "@/lib/db/schema";

/**
 * Keep a single Stripe instance per server runtime.
 * (Prevents re-creating SDK clients every call.)
 */
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  _stripe = new Stripe(key, { apiVersion: "2025-07-30.basil" });
  return _stripe;
}

type ShippingSelection = {
  country?: "US" | "CA";
  state?: string;
  zip?: string;
  carrier?: string;
  method?: string;
  cost?: number; // dollars
  days?: number | null;
  currency?: "USD" | "CAD";
};

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function shipCentsFromSelectedShipping(selectedShipping: unknown): number {
  const s = (selectedShipping ?? {}) as ShippingSelection;
  const dollars = Number(s?.cost ?? 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

/**
 * Create an order + order_items from a cart.
 * - Idempotent by `providerId` (PaymentIntent id) when provided.
 * - Transactional: order, items, cart close happen atomically.
 *
 * Returns: orderId
 */
export async function ensureOrderFromCart(opts: {
  cartId: string;
  stripePaymentIntentId?: string | null;
  status?: "paid" | "processing" | "pending";
}): Promise<string> {
  const cartId = String(opts.cartId || "").trim();
  if (!cartId) throw new Error("missing_cartId");

  const stripePaymentIntentId = (opts.stripePaymentIntentId ?? "").trim() || null;
  const status = opts.status ?? "paid";

  // Fast-path idempotency (outside tx)
  if (stripePaymentIntentId) {
    const [existing] =
      (await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.providerId, stripePaymentIntentId))
        .limit(1)) ?? [];
    if (existing?.id) return String(existing.id);
  }

  return await db.transaction(async (tx) => {
    // Re-check idempotency inside tx (race protection)
    if (stripePaymentIntentId) {
      const [existingInTx] =
        (await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.providerId, stripePaymentIntentId))
          .limit(1)) ?? [];
      if (existingInTx?.id) return String(existingInTx.id);
    }

    // Load cart (must be open)
    const [cartRow] =
      (await tx
        .select({
          id: carts.id,
          sid: carts.sid,
          status: carts.status,
          currency: carts.currency,
          selectedShipping: carts.selectedShipping,
        })
        .from(carts)
        .where(and(eq(carts.id, cartId), ne(carts.status, "closed")))
        .limit(1)) ?? [];

    if (!cartRow) throw new Error("cart_not_found_or_closed");

    // Load lines
    const lineRows =
      (await tx
        .select({
          id: cartLines.id,
          cartId: cartLines.cartId,
          productId: cartLines.productId,
          quantity: cartLines.quantity,
          unitPriceCents: cartLines.unitPriceCents,
          lineTotalCents: cartLines.lineTotalCents,
        })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartRow.id))) ?? [];

    if (lineRows.length === 0) throw new Error("empty_cart");

    // Subtotal
    const subtotalCents = lineRows.reduce((sum, r) => {
      const explicit = toInt(r.lineTotalCents, NaN as any);
      if (Number.isFinite(explicit)) return sum + explicit;

      const qty = Math.max(0, toInt(r.quantity, 0));
      const unit = Math.max(0, toInt(r.unitPriceCents, 0));
      return sum + qty * unit;
    }, 0);

    const shippingCents = shipCentsFromSelectedShipping(cartRow.selectedShipping);
    const currency = (String(cartRow.currency || "USD").toUpperCase() === "CAD" ? "CAD" : "USD") as
      | "USD"
      | "CAD";

    // NOTE:
    // Your current orders schema supports these fields:
    // - provider/providerId/paymentStatus/status/cartId/creditsCents/etc.
    // We'll keep this conservative and aligned.
    const [ins] = await tx
      .insert(orders)
      .values({
        userId: String(cartRow.sid), // guest checkout uses sid for now
        cartId: cartRow.id,

        status: "placed",
        paymentStatus: status === "paid" ? "paid" : "pending",

        provider: "stripe",
        providerId: stripePaymentIntentId,

        currency,
        subtotalCents,
        shippingCents,
        taxCents: 0,
        discountCents: 0,
        totalCents: Math.max(0, subtotalCents + shippingCents),

        placedAt: new Date(),
      } as any)
      .returning({ id: orders.id });

    const orderId = String(ins.id);

    // Insert order items
    // IMPORTANT:
    // Your current orderItems schema does NOT include optionIds.
    // (You can add later if you want; for now, keep schema-aligned.)
    for (const r of lineRows) {
      const qty = Math.max(1, toInt(r.quantity, 1));
      const unit = Math.max(0, toInt(r.unitPriceCents, 0));
      const line = Number.isFinite(Number(r.lineTotalCents))
        ? Math.max(0, toInt(r.lineTotalCents, qty * unit))
        : qty * unit;

      await tx.insert(orderItems).values({
        orderId: orderId as any, // drizzle will cast uuid text as needed
        productId: Number(r.productId),
        quantity: qty,
        unitPriceCents: unit,
        lineTotalCents: line,
      } as any);
    }

    // Close cart
    await tx.update(carts).set({ status: "closed" as any }).where(eq(carts.id, cartRow.id));

    return orderId;
  });
}

/**
 * Given a Stripe Checkout Session id:
 * - Find an order by PaymentIntent id (providerId) if present
 * - If not found and we have cartId metadata, build the order from cart (idempotent)
 */
export async function findOrderIdByStripeSession(sessionId: string): Promise<string | null> {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sid);

    const cartId = (session.metadata?.cartId as string) || null;
    const piId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as any)?.id || null;

    if (piId) {
      const [byPi] =
        (await db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.providerId, piId))
          .limit(1)) ?? [];
      if (byPi?.id) return String(byPi.id);
    }

    if (piId && cartId) {
      return await ensureOrderFromCart({
        cartId,
        stripePaymentIntentId: piId,
        status: "paid",
      });
    }
  } catch {
    // swallow: callers treat null as "not found yet"
  }

  return null;
}
