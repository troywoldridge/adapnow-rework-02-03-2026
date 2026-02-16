// src/app/api/stripe/webhook/tax.ts
import "server-only";
import type Stripe from "stripe";

export type TaxAddress = {
  country: string;            // "US" | "CA" | ...
  state?: string | null;      // state/province code
  postalCode?: string | null; // zip/postal
  city?: string | null;
  line1?: string | null;
  line2?: string | null;
};

export type TaxLine = {
  reference: string;   // stable id for the line (cartLineId, etc.)
  amountCents: number; // total for this line (NOT unit), in cents
  quantity?: number;   // optional; defaults to 1
  taxCode?: string;    // optional Stripe tax code (txcd_...)
  taxBehavior?: "exclusive" | "inclusive"; // default "exclusive"
};

function normCode(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function clampInt(v: unknown, min = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.trunc(n));
}

/**
 * Allocate a discount across line amounts proportionally.
 * - Discounts reduce taxable base (credits treated as discount).
 * - Never makes any line negative.
 */
export function allocateDiscountAcrossLines(args: {
  lines: Array<{ reference: string; amountCents: number }>;
  discountCents: number;
}): Record<string, number> {
  const discountCents = clampInt(args.discountCents, 0);
  const lines = args.lines
    .map((l) => ({ reference: String(l.reference), amountCents: clampInt(l.amountCents, 0) }))
    .filter((l) => l.reference && l.amountCents > 0);

  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
  const applied = Math.min(discountCents, subtotal);

  if (applied <= 0 || subtotal <= 0 || lines.length === 0) return {};

  // Proportional allocation with remainder fixup.
  const out: Record<string, number> = {};
  let used = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isLast = i === lines.length - 1;

    let share = isLast
      ? applied - used
      : Math.floor((applied * l.amountCents) / subtotal);

    share = Math.min(share, l.amountCents);
    if (share < 0) share = 0;

    out[l.reference] = share;
    used += share;
  }

  return out;
}

/**
 * Create a Stripe Tax calculation for your cart totals.
 * You should call this BEFORE creating the PaymentIntent.
 *
 * Notes:
 * - Provide FINAL amounts (after discounts) in line_items amounts.
 * - Shipping can be taxed via shipping_cost.amount.
 */
export async function createStripeTaxCalculation(args: {
  stripe: Stripe;
  currency: "usd" | "cad";
  address: TaxAddress;
  lines: TaxLine[];
  shippingCents?: number;
  shippingTaxCode?: string; // optional
  expandTaxBreakdown?: boolean;
}) {
  const { stripe } = args;

  const currency = args.currency === "cad" ? "cad" : "usd";
  const country = normCode(args.address?.country);
  const state = normCode(args.address?.state);
  const postal = String(args.address?.postalCode ?? "").trim();

  if (!country) throw new Error("Missing tax address country");
  if (!postal) throw new Error("Missing tax address postalCode");

  const line_items = args.lines
    .map((l) => {
      const amount = clampInt(l.amountCents, 0);
      if (amount <= 0) return null;
      return {
        reference: String(l.reference).slice(0, 64),
        amount,
        quantity: clampInt(l.quantity ?? 1, 1),
        tax_behavior: (l.taxBehavior ?? "exclusive") as "exclusive" | "inclusive",
        ...(l.taxCode ? { tax_code: String(l.taxCode) } : {}),
      };
    })
    .filter(Boolean) as any[];

  if (line_items.length === 0) throw new Error("No taxable line items");

  const shippingCents = clampInt(args.shippingCents ?? 0, 0);

  const calculation = await stripe.tax.calculations.create({
    currency,
    line_items,
    customer_details: {
      address: {
        country,
        ...(state ? { state } : {}),
        postal_code: postal,
        ...(args.address?.city ? { city: String(args.address.city) } : {}),
        ...(args.address?.line1 ? { line1: String(args.address.line1) } : {}),
        ...(args.address?.line2 ? { line2: String(args.address.line2) } : {}),
      },
      address_source: "shipping",
    },
    ...(shippingCents > 0
      ? {
          shipping_cost: {
            amount: shippingCents,
            tax_behavior: "exclusive",
            ...(args.shippingTaxCode ? { tax_code: String(args.shippingTaxCode) } : {}),
          },
        }
      : {}),
    ...(args.expandTaxBreakdown ? { expand: ["line_items.data.tax_breakdown"] } : {}),
  } as any);

  return {
    id: calculation.id,
    amountSubtotalCents: clampInt((calculation as any).amount_subtotal, 0),
    taxCents: clampInt((calculation as any).tax_amount_exclusive, 0),
    amountTotalCents: clampInt((calculation as any).amount_total, 0),
    raw: calculation,
  };
}

/**
 * Webhook-safe reconciliation:
 * Stripe is source of truth for what got charged.
 * This derives "tax" as:
 *    tax = stripeTotal - (netSubtotal + shipping)
 *
 * Where netSubtotal is AFTER discounts/credits.
 */
export function reconcileTaxFromStripeTotal(args: {
  stripeTotalCents: number | null;
  netSubtotalCents: number;
  shippingCents: number;
}): { taxCents: number; reconciledWithStripe: boolean } {
  const stripeTotalCents =
    typeof args.stripeTotalCents === "number" && Number.isFinite(args.stripeTotalCents)
      ? Math.max(0, Math.round(args.stripeTotalCents))
      : null;

  const netSubtotalCents = clampInt(args.netSubtotalCents, 0);
  const shippingCents = clampInt(args.shippingCents, 0);

  if (stripeTotalCents === null) {
    return { taxCents: 0, reconciledWithStripe: false };
  }

  const expectedNoTax = netSubtotalCents + shippingCents;
  const taxCents = Math.max(0, stripeTotalCents - expectedNoTax);

  return { taxCents, reconciledWithStripe: true };
}
