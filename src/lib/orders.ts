import "server-only";

import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { carts, cartLines, orders, orderItems } from "@/lib/db/schema";

let stripeSingleton: Stripe | null = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, { apiVersion: "2025-07-30.basil" });
  }
  return stripeSingleton;
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

function toInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

type OrderInsert = typeof orders.$inferInsert;
type OrderItemInsert = typeof orderItems.$inferInsert;

export async function ensureOrderFromCart(opts: {
  cartId: string;
  stripePaymentIntentId?: string | null;
  status?: "paid" | "processing" | "pending";
}): Promise<string> {
  const { cartId, stripePaymentIntentId, status = "paid" } = opts;

  // If we have a PI id, try to return the existing order first (idempotency).
  if (stripePaymentIntentId) {
    const [existing] =
      (await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.providerId, stripePaymentIntentId))
        .limit(1)) ?? [];
    if (existing) return String(existing.id);
  }

  return await db.transaction(async (tx) => {
    // Re-check inside tx to prevent double-create in races
    if (stripePaymentIntentId) {
      const [existingInTx] =
        (await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.providerId, stripePaymentIntentId))
          .limit(1)) ?? [];
      if (existingInTx) return String(existingInTx.id);
    }

    const [cartRow] =
      (await tx
        .select({
          id: carts.id,
          status: carts.status,
          currency: carts.currency,
          selectedShipping: carts.selectedShipping,
          sid: carts.sid,
        })
        .from(carts)
        .where(and(eq(carts.id, cartId), ne(carts.status, "closed")))
        .limit(1)) ?? [];

    if (!cartRow) throw new Error("cart_not_found_or_closed");

    const lineRows =
      (await tx
        .select({
          id: cartLines.id,
          productId: cartLines.productId,
          quantity: cartLines.quantity,
          unitPriceCents: cartLines.unitPriceCents,
          lineTotalCents: cartLines.lineTotalCents,
          optionIds: cartLines.optionIds,
        })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartRow.id))) ?? [];

    if (lineRows.length === 0) throw new Error("empty_cart");

    const subtotalCents = lineRows.reduce((sum, r) => {
      const explicit = toInt(r.lineTotalCents, NaN as any);
      if (Number.isFinite(explicit)) return sum + explicit;

      const qty = Math.max(0, toInt(r.quantity, 0));
      const unit = Math.max(0, toInt(r.unitPriceCents, 0));
      return sum + qty * unit;
    }, 0);

    // selectedShipping is often JSON/unknown depending on schema column type
    const ship = (cartRow.selectedShipping ?? {}) as unknown as ShippingSelection;
    const shippingCents = Math.max(0, Math.round((Number(ship.cost) || 0) * 100));

    const currency = (cartRow.currency as "USD" | "CAD") ?? "USD";

    const orderToInsert: OrderInsert = {
      userId: cartRow.sid,
      status: "placed",
      paymentStatus: status === "paid" ? "paid" : "pending",
      provider: "stripe",
      providerId: stripePaymentIntentId ?? null,
      currency,
      subtotalCents,
      shippingCents,
      taxCents: 0,
      discountCents: 0,
      totalCents: Math.max(0, subtotalCents + shippingCents),
      // Prefer Date if your schema column is timestamp; if it's text, Drizzle will cast
      placedAt: new Date() as any,
    };

    const [ins] = await tx.insert(orders).values(orderToInsert).returning({ id: orders.id });
    const orderId = String(ins.id);

    // Insert items
    for (const r of lineRows) {
      const itemToInsert: OrderItemInsert = {
        orderId,
        productId: Number(r.productId),
        quantity: Math.max(1, toInt(r.quantity, 1)),
        unitPriceCents: Math.max(0, toInt(r.unitPriceCents, 0)),
        lineTotalCents: Math.max(0, toInt(r.lineTotalCents, 0)),
        optionIds: Array.isArray(r.optionIds) ? r.optionIds : [],
      };

      await tx.insert(orderItems).values(itemToInsert);
    }

    // Close cart
    await tx.update(carts).set({ status: "closed" as any }).where(eq(carts.id, cartRow.id));

    return orderId;
  });
}

export async function findOrderIdByStripeSession(sessionId: string): Promise<string | null> {
  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId);

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
      if (byPi) return String(byPi.id);
    }

    if (piId && cartId) {
      return await ensureOrderFromCart({
        cartId,
        stripePaymentIntentId: piId,
        status: "paid",
      });
    }
  } catch {
    // intentionally swallow (caller treats null as "not found")
  }

  return null;
}
