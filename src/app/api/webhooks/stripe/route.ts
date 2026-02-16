// src/app/api/webhooks/stripe/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { getCartCreditsCents } from "@/lib/cartCredits";

import { orders } from "@/lib/db/schema/orders";
import { orderItems } from "@/lib/db/schema/orderItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-07-30.basil" });

function ok(extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...(extra || {}) }, { status: 200 });
}
function bad(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra || {}) }, { status });
}

function toInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** selectedShipping stores dollars, convert to cents */
function shipCentsFromSelectedShipping(selectedShipping: unknown): number {
  const s = selectedShipping as any;
  const dollars = Number(s?.cost ?? s?.rate?.cost ?? s?.price ?? 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

async function finalizeStripePaymentIntent(pi: Stripe.PaymentIntent) {
  const paymentIntentId = pi.id;
  const md = (pi.metadata || {}) as Record<string, string>;
  const cartId = (md.cartId || md.cart_id || "").trim() || null;
  const sid = (md.sid || md.SID || "").trim() || null;

  // 1) Idempotent check by provider/providerId
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.provider, "stripe"), eq(orders.providerId, paymentIntentId)))
    .limit(1);

  if (existing?.[0]?.id) {
    return { mode: "already" as const, orderId: String(existing[0].id) };
  }

  // 2) Find cart (prefer cartId; fallback sid)
  let cartRow:
    | {
        id: string;
        sid: string;
        userId: string | null;
        status: string;
        currency: string;
        selectedShipping: unknown;
      }
    | null = null;

  if (cartId) {
    const [c] = await db
      .select({
        id: carts.id,
        sid: carts.sid,
        userId: carts.userId,
        status: carts.status,
        currency: carts.currency,
        selectedShipping: carts.selectedShipping,
      })
      .from(carts)
      .where(eq(carts.id, cartId))
      .limit(1);

    if (c) cartRow = { ...c, userId: c.userId ?? null };
  }

  if (!cartRow && sid) {
    const [c] = await db
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

    if (c) cartRow = { ...c, userId: c.userId ?? null };
  }

  if (!cartRow) {
    // Ack webhook (no point retrying forever)
    return { mode: "no_cart" as const, orderId: null as string | null };
  }

  // 3) Load lines
  const lines = await db
    .select({
      productId: cartLines.productId,
      quantity: cartLines.quantity,
      unitPriceCents: cartLines.unitPriceCents,
      lineTotalCents: cartLines.lineTotalCents,
      optionIds: cartLines.optionIds,
    })
    .from(cartLines)
    .where(eq(cartLines.cartId, cartRow.id));

  const subtotalCents = (lines || []).reduce((sum, r) => {
    const qty = toInt(r.quantity, 0);
    const unit = toInt(r.unitPriceCents, 0);
    const line = Number.isFinite(Number(r.lineTotalCents))
      ? toInt(r.lineTotalCents, qty * unit)
      : qty * unit;
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);

  const shippingCents = shipCentsFromSelectedShipping(cartRow.selectedShipping);
  const creditsCents = await getCartCreditsCents(cartRow.id);
  const taxCents = 0;
  const totalCents = Math.max(0, subtotalCents + shippingCents + taxCents - creditsCents);

  // Optional: sanity check Stripe amount, but don't hard-fail (can drift if you add tax later)
  // if (typeof pi.amount === "number" && pi.amount !== totalCents) { ...log... }

  // IMPORTANT: orders.userId is NOT NULL
  const userId = (cartRow.userId && String(cartRow.userId)) || "guest";

  const created = await db.transaction(async (tx) => {
    const [o] = await tx
      .insert(orders)
      .values({
        userId,
        status: "paid",
        currency: (String(cartRow!.currency || "USD").toUpperCase() as "USD" | "CAD"),
        subtotalCents,
        taxCents,
        shippingCents,
        discountCents: 0,
        totalCents,
        placedAt: new Date(),

        provider: "stripe",
        providerId: paymentIntentId,

        cartId: cartRow!.id,
        paymentStatus: "paid",

        creditsCents,
      })
      .returning({ id: orders.id });

    const orderId = String(o.id);

    if (lines.length) {
      await tx.insert(orderItems).values(
        lines.map((ln) => ({
          orderId,
          productId: Number(ln.productId),
          quantity: Number(ln.quantity || 1),
          unitPriceCents: Number(ln.unitPriceCents || 0),
          lineTotalCents: Number(
            ln.lineTotalCents ??
              (Number(ln.quantity || 1) * Number(ln.unitPriceCents || 0))
          ),
          optionIds: (ln.optionIds as unknown as number[]) ?? [],
        }))
      );
    }

    // Close cart
    await tx
      .update(carts)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(carts.id, cartRow!.id));

    return { orderId };
  });

  return { mode: "created" as const, orderId: created.orderId };
}

export async function POST(req: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return bad("stripe_webhook_not_configured", 500);
  }

  const sig = req.headers.get("stripe-signature") || "";
  if (!sig) return bad("missing_stripe_signature", 400);

  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    console.error("[stripe-webhook] invalid signature:", e?.message || e);
    return bad("invalid_signature", 400);
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const res = await finalizeStripePaymentIntent(pi);

      // Always ACK 200 for known outcomes so Stripe stops retrying
      return ok({ received: true, event: event.type, mode: res.mode, orderId: res.orderId });
    }

    // Ack everything else (avoid Stripe retry storms)
    return ok({ received: true, event: event.type, ignored: true });
  } catch (e: any) {
    // 500 tells Stripe to retry (good for transient DB errors)
    console.error("[stripe-webhook] handler error:", e?.message || e);
    return bad("webhook_handler_failed", 500, { detail: e?.message || String(e) });
  }
}
