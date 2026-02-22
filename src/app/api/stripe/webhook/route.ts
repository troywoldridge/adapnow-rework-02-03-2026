// src/app/api/stripe/webhook/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/lib/db";
import { and, eq, ne } from "drizzle-orm";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartCredits } from "@/lib/db/schema/cartCredits";
import { orders } from "@/lib/db/schema/orders";
import { getCartCreditsCents } from "@/lib/cartCredits";

import { reconcileTaxFromStripeTotal } from "./tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ------------------------- Strict envs ------------------------- */
const STRIPE_KEY: string =
  process.env.STRIPE_SECRET_KEY ??
  (() => {
    throw new Error("Missing STRIPE_SECRET_KEY");
  })();

const STRIPE_WEBHOOK_SECRET: string =
  process.env.STRIPE_WEBHOOK_SECRET ??
  (() => {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  })();

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2026-01-28.clover" });

/* ------------------------ small helpers ------------------------ */
function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function clamp0(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * selectedShipping is stored as JSON in DB (often "unknown" type at compile time).
 * We tolerate many shapes and treat cost as dollars.
 */
function shippingCentsFromSelectedShipping(selectedShipping: unknown): number {
  const s = selectedShipping as any;
  const dollars = Number(s?.cost ?? 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

/* --------------------- Helpers: cart & totals ------------------- */
async function loadOpenCartByRef(ref: { cartId?: string | null; sid?: string | null }) {
  const { cartId, sid } = ref;
  const { select } = db;

  if (cartId) {
    const [byId] =
      (await select({
        id: carts.id,
        status: carts.status,
        currency: carts.currency,
        selectedShipping: carts.selectedShipping,
        sid: carts.sid,
        userId: carts.userId,
      })
        .from(carts)
        .where(and(eq(carts.id, cartId), ne(carts.status, "closed")))
        .limit(1)) ?? [];
    if (byId) return byId;
  }

  if (sid) {
    const [bySid] =
      (await select({
        id: carts.id,
        status: carts.status,
        currency: carts.currency,
        selectedShipping: carts.selectedShipping,
        sid: carts.sid,
        userId: carts.userId,
      })
        .from(carts)
        .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
        .limit(1)) ?? [];
    if (bySid) return bySid;
  }

  return null;
}

/**
 * Compute:
 * - subtotalCents (raw, before discounts)
 * - creditsCents (discount)
 * - netSubtotalCents (after discount)
 * - shippingCents
 * - taxCents (from Stripe Tax calc if available; else reconcile from stripe total)
 * - totalCents = netSubtotal + shipping + tax   (IMPORTANT: do NOT subtract credits twice)
 */
async function computeCartTotalsCents(
  cartRow: {
    id: string;
    currency: "USD" | "CAD" | string | null;
    selectedShipping: unknown; // ✅ accept unknown; we parse safely in helper
  },
  opts: {
    stripeTotalCents?: number | null;
    taxCalculationId?: string | null;
  } = {},
) {
  const { select } = db;

  const rows = await select({
    quantity: cartLines.quantity,
    unitPriceCents: cartLines.unitPriceCents,
    lineTotalCents: cartLines.lineTotalCents,
  })
    .from(cartLines)
    .where(eq(cartLines.cartId, cartRow.id));

  const subtotalCents = clamp0(
    rows.reduce((sum: number, r: any) => {
      const qty = Math.max(0, toInt(r.quantity ?? 0, 0));
      const unit = Math.max(0, toInt(r.unitPriceCents ?? 0, 0));
      const line = Number.isFinite(Number(r.lineTotalCents))
        ? Math.max(0, toInt(r.lineTotalCents, qty * unit))
        : Math.max(0, qty * unit);
      return sum + (Number.isFinite(line) ? line : 0);
    }, 0),
  );

  const shippingCents = clamp0(shippingCentsFromSelectedShipping(cartRow.selectedShipping));
  const creditsCents = clamp0(await getCartCreditsCents(cartRow.id));

  // credits treated as DISCOUNT (reduces taxable base)
  const discountCents = Math.min(creditsCents, subtotalCents);
  const netSubtotalCents = clamp0(subtotalCents - discountCents);

  // --- tax: prefer Stripe Tax Calculation if we have it ---
  let taxCents = 0;
  let taxSource: "stripe_tax_calculation" | "reconciled_from_total" | "unknown" = "unknown";

  const taxCalculationId =
    typeof opts.taxCalculationId === "string" && opts.taxCalculationId.trim()
      ? opts.taxCalculationId.trim()
      : null;

  if (taxCalculationId) {
    try {
      const calc = await stripe.tax.calculations.retrieve(taxCalculationId);
      const v = (calc as any)?.tax_amount_exclusive;
      const n = typeof v === "number" ? v : Number(v);
      taxCents = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
      taxSource = "stripe_tax_calculation";
    } catch (e: any) {
      console.warn("[stripe/webhook] tax calculation retrieve failed:", e?.message || e);
    }
  }

  // --- fallback: Stripe charged total reconciliation ---
  if (taxCents === 0) {
    const { taxCents: reconciled, reconciledWithStripe } = reconcileTaxFromStripeTotal({
      stripeTotalCents: opts.stripeTotalCents ?? null,
      netSubtotalCents,
      shippingCents,
    });
    if (reconciledWithStripe) {
      taxCents = reconciled;
      taxSource = "reconciled_from_total";
    }
  }

  // IMPORTANT: total is netSubtotal + shipping + tax (credits already applied in netSubtotal)
  const totalCents = clamp0(netSubtotalCents + shippingCents + taxCents);

  const ordersCurrency = String(cartRow.currency || "USD").toUpperCase() as "USD" | "CAD";
  const stripeCurrency = (ordersCurrency === "CAD" ? "cad" : "usd") as "usd" | "cad";

  return {
    subtotalCents,
    shippingCents,
    taxCents,
    taxSource,
    creditsCents,
    discountCents,
    netSubtotalCents,
    totalCents,
    ordersCurrency,
    stripeCurrency,
  };
}

/* ----------------- Idempotent order finalizer ------------------- */
async function finalizePaidOrderFromCartRef(args: {
  piId?: string | null;
  sessionId?: string | null;
  sid?: string | null;
  cartId?: string | null;
  stripeTotalCents?: number | null;
  taxCalculationId?: string | null;
}) {
  const { piId, cartId, sid } = args;
  const { select, transaction } = db;

  // Idempotency 1: already have order for this PaymentIntent
  if (piId) {
    const existing = await select({ id: orders.id })
      .from(orders)
      .where(eq(orders.providerId, piId))
      .limit(1);
    if (existing.length > 0) return String(existing[0].id);
  }

  // Idempotency 2: already have order for this cart
  if (cartId) {
    const existingByCart = await select({ id: orders.id })
      .from(orders)
      .where(eq(orders.cartId, cartId))
      .limit(1);
    if (existingByCart.length > 0) return String(existingByCart[0].id);
  }

  const cart = await loadOpenCartByRef({ cartId: cartId ?? null, sid: sid ?? null });
  if (!cart) return null;

  const totals = await computeCartTotalsCents(cart, {
    stripeTotalCents: args.stripeTotalCents ?? null,
    taxCalculationId: args.taxCalculationId ?? null,
  });

  const result = await transaction(async (tx: any) => {
    const safeUserId = (cart as any).userId ?? (cart as any).sid;

    const [order] = await tx
      .insert(orders)
      .values({
        userId: safeUserId,
        cartId: (cart as any).id,
        status: "placed",
        paymentStatus: "paid",
        provider: "stripe",
        providerId: piId ?? null,

        currency: totals.ordersCurrency,

        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,

        discountCents: totals.discountCents,
        creditsCents: totals.creditsCents,

        totalCents: totals.totalCents,

        placedAt: new Date().toISOString(),
      } as any)
      .returning({ id: orders.id });

    await tx.update(carts).set({ status: "closed" as any }).where(eq(carts.id, (cart as any).id));
    await tx.delete(cartCredits).where(eq(cartCredits.cartId, (cart as any).id));

    return { orderId: String(order.id) };
  });

  return result.orderId;
}

/* ------------------------- Webhook handler ---------------------- */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;

        const sid = pi.metadata?.sid ?? null;
        const cartId = pi.metadata?.cartId ?? null;

        const taxCalculationId =
          typeof (pi.metadata as any)?.tax_calculation_id === "string"
            ? String((pi.metadata as any).tax_calculation_id)
            : null;

        const amountReceivedCents =
          typeof pi.amount_received === "number" && pi.amount_received > 0
            ? pi.amount_received
            : typeof pi.amount === "number"
              ? pi.amount
              : null;

        await finalizePaidOrderFromCartRef({
          piId: pi.id,
          sid,
          cartId,
          stripeTotalCents: amountReceivedCents,
          taxCalculationId,
        });

        return NextResponse.json({ ok: true });
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const sid = (session.metadata?.sid as string) ?? null;
        const cartId = (session.metadata?.cartId as string) ?? null;

        const piId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent as any)?.id ?? null;

        const amountTotalCents =
          typeof (session as any)?.amount_total === "number"
            ? (session as any).amount_total
            : null;

        let taxCalculationId: string | null = null;

        try {
          if (piId) {
            const pi = await stripe.paymentIntents.retrieve(piId);
            taxCalculationId =
              typeof (pi.metadata as any)?.tax_calculation_id === "string"
                ? String((pi.metadata as any).tax_calculation_id)
                : null;
          }
        } catch (e: any) {
          console.warn("[stripe/webhook] retrieve PI for tax_calculation_id failed:", e?.message || e);
        }

        await finalizePaidOrderFromCartRef({
          piId: piId ?? null,
          sessionId: session.id,
          sid,
          cartId,
          stripeTotalCents: amountTotalCents,
          taxCalculationId,
        });

        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: true, ignored: event.type });
    }
  } catch (e: any) {
    console.error("webhook handler failed:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}