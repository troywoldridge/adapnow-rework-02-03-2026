// src/app/api/create-payment-intent/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartCredits } from "@/lib/db/schema/cartCredits";
import { stripe } from "@/lib/stripe";

import {
  allocateDiscountAcrossLines,
  createStripeTaxCalculation,
  reconcileTaxFromStripeTotal,
  type TaxAddress,
} from "@/app/api/stripe/webhook/tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toInt(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function shippingCentsFromSelectedShipping(selectedShipping: unknown): number {
  const s = selectedShipping as any;
  const dollars = Number(s?.cost ?? 0);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function taxAddressFromSelectedShipping(selectedShipping: unknown): TaxAddress | null {
  const s = selectedShipping as any;

  // Support both your earlier shapes:
  // - { shipCountry, shipState, shipZip }
  // - { country, state, zip }
  const country = String(s?.shipCountry ?? s?.country ?? "").trim().toUpperCase();
  const state = String(s?.shipState ?? s?.state ?? "").trim().toUpperCase();
  const postalCode = String(s?.shipZip ?? s?.zip ?? "").trim();

  if (!country || !postalCode) return null;

  return {
    country,
    state: state || null,
    postalCode,
    city: s?.city ? String(s.city) : null,
    line1: s?.line1 ? String(s.line1) : null,
    line2: s?.line2 ? String(s.line2) : null,
  };
}

async function sumCreditsCents(cartId: string): Promise<number> {
  const rows = await db
    .select({ amountCents: cartCredits.amountCents })
    .from(cartCredits)
    .where(eq(cartCredits.cartId, cartId));

  const sum = rows.reduce((acc, r) => acc + toInt(r.amountCents, 0), 0);
  return Math.max(0, sum);
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    const sid =
      req.cookies.get("adap_sid")?.value ??
      req.cookies.get("sid")?.value ??
      req.headers.get("x-sid") ??
      "";

    if (!sid) {
      return NextResponse.json({ ok: false, error: "missing_sid" }, { status: 400 });
    }

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

    if (!cart) {
      return NextResponse.json({ ok: false, error: "no_open_cart" }, { status: 404 });
    }

    const shippingCents = shippingCentsFromSelectedShipping(cart.selectedShipping);
    const address = taxAddressFromSelectedShipping(cart.selectedShipping);

    if (!address) {
      return NextResponse.json(
        { ok: false, error: "missing_shipping_address_for_tax" },
        { status: 400 }
      );
    }

    const lineRows = await db
      .select({
        id: cartLines.id,
        quantity: cartLines.quantity,
        unitPriceCents: cartLines.unitPriceCents,
        lineTotalCents: cartLines.lineTotalCents,
      })
      .from(cartLines)
      .where(eq(cartLines.cartId, cart.id));

    if (lineRows.length === 0) {
      return NextResponse.json({ ok: false, error: "empty_cart" }, { status: 400 });
    }

    // Subtotal from DB (prefer lineTotalCents, fallback qty*unit)
    const rawLines = lineRows.map((r) => {
      const qty = Math.max(1, toInt(r.quantity, 1));
      const unit = Math.max(0, toInt(r.unitPriceCents, 0));
      const line = Number.isFinite(Number(r.lineTotalCents))
        ? Math.max(0, toInt(r.lineTotalCents, qty * unit))
        : Math.max(0, qty * unit);

      return {
        lineId: String(r.id),
        qty,
        rawLineTotalCents: line,
      };
    }).filter((l) => l.rawLineTotalCents > 0);

    const subtotalCents = rawLines.reduce((s, l) => s + l.rawLineTotalCents, 0);

    const creditsCents = await sumCreditsCents(cart.id);
    const discountCents = Math.min(creditsCents, subtotalCents); // credits treated as discount

    // Allocate discount across lines → net taxable line totals
    const discountByRef = allocateDiscountAcrossLines({
      lines: rawLines.map((l) => ({ reference: l.lineId, amountCents: l.rawLineTotalCents })),
      discountCents,
    });

    const netLinesForTax = rawLines.map((l) => {
      const disc = Math.max(0, toInt(discountByRef[l.lineId] ?? 0, 0));
      const net = Math.max(0, l.rawLineTotalCents - disc);
      return {
        reference: l.lineId,
        amountCents: net,
        quantity: 1,
        taxBehavior: "exclusive" as const,
      };
    }).filter((l) => l.amountCents > 0);

    const netSubtotalCents = netLinesForTax.reduce((s, l) => s + l.amountCents, 0);

    const currencyUpper = String(cart.currency || "USD").toUpperCase();
    const currency = (currencyUpper === "CAD" ? "cad" : "usd") as "usd" | "cad";

    // If everything is discounted to zero AND shipping is zero → free flow
    if (netSubtotalCents + shippingCents <= 0) {
      return NextResponse.json({
        ok: true,
        mode: "free",
        totalCents: 0,
        currency: currencyUpper,
        breakdown: { subtotalCents, shippingCents, taxCents: 0, creditsCents },
      });
    }

    // Stripe Tax calculation
    const calc = await createStripeTaxCalculation({
      stripe,
      currency,
      address,
      lines: netLinesForTax,
      shippingCents,
      expandTaxBreakdown: false,
    });

    // Create PI using Stripe Tax "amount_total"
    const intent = await stripe.paymentIntents.create({
      amount: calc.amountTotalCents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        sid: String(sid),
        cartId: String(cart.id),
        userId: userId ? String(userId) : "",
        tax_calculation_id: String(calc.id),
      },
    });

    // Derive a webhook-safe breakdown (tax is from calc; also reconcile helper exists for webhooks)
    const taxCents = calc.taxCents;
    const totalCents = calc.amountTotalCents;

    return NextResponse.json({
      ok: true,
      mode: "stripe",
      clientSecret: intent.client_secret,
      amount: totalCents,
      currency,
      breakdown: {
        subtotalCents,
        netSubtotalCents,
        shippingCents,
        taxCents,
        creditsCents,
        discountCents,
      },
      stripeTax: {
        calculationId: calc.id,
        amountSubtotalCents: calc.amountSubtotalCents,
        amountTotalCents: calc.amountTotalCents,
        taxCents: calc.taxCents,
      },
    });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    console.error("[create-payment-intent] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
