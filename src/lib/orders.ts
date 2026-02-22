import "server-only";

import Stripe from "stripe";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { carts, cartLines, orders, orderItems } from "@/lib/db/schema";

let stripeSingleton: Stripe | null = null;

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function toInt(v: unknown, fallback = 0): number {
  const x = Math.trunc(n(v, fallback));
  return Number.isFinite(x) ? x : fallback;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const x = toInt(v, fallback);
  return Math.min(max, Math.max(min, x));
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, { apiVersion: "2026-01-28.clover" });
  }
  return stripeSingleton;
}

type Currency = "USD" | "CAD";

type ShippingSelection = {
  country?: "US" | "CA";
  state?: string;
  zip?: string;

  carrier?: string;
  method?: string;

  // dollars
  cost?: number;

  days?: number | null;
  currency?: Currency;
};

type OrderInsert = typeof orders.$inferInsert;
type OrderItemInsert = typeof orderItems.$inferInsert;

function parseSelectedShipping(v: unknown): ShippingSelection {
  if (!v || typeof v !== "object") return {};
  const obj = v as Record<string, unknown>;

  const countryRaw = s(obj.country).toUpperCase();
  const country = countryRaw === "US" || countryRaw === "CA" ? (countryRaw as "US" | "CA") : undefined;

  const currencyRaw = s(obj.currency).toUpperCase();
  const currency = currencyRaw === "USD" || currencyRaw === "CAD" ? (currencyRaw as Currency) : undefined;

  const daysVal = obj.days;
  const days =
    daysVal === null
      ? null
      : Number.isFinite(Number(daysVal))
        ? Math.max(0, Math.floor(Number(daysVal)))
        : undefined;

  const cost = Number.isFinite(Number(obj.cost)) ? Number(obj.cost) : undefined;

  return {
    country,
    state: s(obj.state) || undefined,
    zip: s(obj.zip) || undefined,
    carrier: s(obj.carrier) || undefined,
    method: s(obj.method) || undefined,
    cost,
    days,
    currency,
  };
}

function shippingCostToCents(ship: ShippingSelection): number {
  const dollars = n(ship.cost, 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.max(0, Math.round(dollars * 100));
}

function computeSubtotalCents(
  lines: Array<{ quantity: unknown; unitPriceCents: unknown; lineTotalCents: unknown }>
): number {
  return lines.reduce((sum, r) => {
    const explicit = n(r.lineTotalCents, NaN);
    if (Number.isFinite(explicit)) return sum + Math.max(0, Math.floor(explicit));

    const qty = clampInt(r.quantity, 1, 999_999, 1);
    const unit = clampInt(r.unitPriceCents, 0, 9_999_999_999, 0);
    return sum + qty * unit;
  }, 0);
}

async function findOrderIdByProviderId(providerId: string): Promise<string | null> {
  const pid = s(providerId);
  if (!pid) return null;

  const [existing] =
    (await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.providerId, pid))
      .limit(1)) ?? [];

  return existing ? String(existing.id) : null;
}

/**
 * Create an order + order items from a cart.
 * Idempotent by providerId (Stripe PI).
 *
 * Transaction:
 * - inserts order
 * - inserts items
 * - closes cart
 * All-or-nothing.
 */
export async function ensureOrderFromCart(opts: {
  cartId: string;
  stripePaymentIntentId?: string | null;
  status?: "paid" | "processing" | "pending";
}): Promise<string> {
  const cartId = s(opts.cartId);
  const providerId = s(opts.stripePaymentIntentId);
  const status = opts.status ?? "paid";

  if (!cartId) throw new Error("missing_cart_id");

  // Fast path (outside tx)
  if (providerId) {
    const existingId = await findOrderIdByProviderId(providerId);
    if (existingId) return existingId;
  }

  return db.transaction(async (tx) => {
    // Re-check inside tx for concurrency safety
    if (providerId) {
      const [existingInTx] =
        (await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.providerId, providerId))
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

    const subtotalCents = computeSubtotalCents(lineRows);

    const ship = parseSelectedShipping(cartRow.selectedShipping);
    const shippingCents = shippingCostToCents(ship);

    const currencyRaw = s(cartRow.currency).toUpperCase();
    const currency: Currency = currencyRaw === "CAD" ? "CAD" : "USD";

    // Future: compute tax/discount/loyalty server-side (you explicitly want that).
    const taxCents = 0;
    const discountCents = 0;
    const totalCents = Math.max(0, subtotalCents + shippingCents + taxCents - discountCents);

    const orderToInsert: OrderInsert = {
      userId: cartRow.sid,
      status: "placed",
      paymentStatus: status === "paid" ? "paid" : "pending",
      provider: "stripe",
      providerId: providerId || null,
      currency,
      subtotalCents,
      shippingCents,
      taxCents,
      discountCents,
      totalCents,
      placedAt: new Date(),
    };

    const [ins] = await tx.insert(orders).values(orderToInsert).returning({ id: orders.id });
    const orderId = String(ins.id);

    for (const r of lineRows) {
      const qty = clampInt(r.quantity, 1, 999_999, 1);
      const unit = clampInt(r.unitPriceCents, 0, 9_999_999_999, 0);
      const lineTotal = clampInt(r.lineTotalCents, 0, 9_999_999_999, qty * unit);

      const itemToInsert: OrderItemInsert = {
        orderId,
        productId: toInt(r.productId, 0),
        quantity: qty,
        unitPriceCents: unit,
        lineTotalCents: lineTotal,
        optionIds: Array.isArray(r.optionIds) ? r.optionIds : [],
      };

      await tx.insert(orderItems).values(itemToInsert);
    }

    await tx
      .update(carts)
      .set({ status: "closed", updatedAt: sql`now()` })
      .where(eq(carts.id, cartRow.id));

    return orderId;
  });
}

/**
 * Given a Stripe Checkout Session ID, try to find the matching order.
 * - First checks payment_intent -> orders.providerId
 * - If not found and metadata.cartId exists, creates order from cart (idempotent)
 */
export async function findOrderIdByStripeSession(sessionId: string): Promise<string | null> {
  const sid = s(sessionId);
  if (!sid) return null;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sid);

    const cartId = s(session.metadata?.cartId);

    const piId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : s((session.payment_intent as { id?: unknown } | null)?.id);

    if (piId) {
      const existingId = await findOrderIdByProviderId(piId);
      if (existingId) return existingId;
    }

    if (piId && cartId) {
      return await ensureOrderFromCart({
        cartId,
        stripePaymentIntentId: piId,
        status: "paid",
      });
    }

    return null;
  } catch {
    return null;
  }
}
