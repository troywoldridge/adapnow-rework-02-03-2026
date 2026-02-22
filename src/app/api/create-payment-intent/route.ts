import "server-only";

import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * IMPORTANT (Cloudflare / Next build):
 * Do NOT throw for missing env vars at module evaluation time.
 * Next may import API routes during "Collecting page data", and throwing here breaks builds.
 *
 * Read envs only inside the handler.
 *
 * Stripe docs: https://stripe.com/docs/payments/payment-intents
 * Next route config: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
 * OpenNext on Cloudflare: https://opennext.js.org/cloudflare/
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  clientSecret: string;
  paymentIntentId: string;
};

type ApiErr = {
  ok: false;
  error: string;
};

type CreatePaymentIntentBody = {
  amountCents?: number;
  currency?: string;
  cartId?: string;
  email?: string;
  metadata?: Record<string, string>;
};

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function safeCurrency(v: unknown): string {
  const c = s(v).toUpperCase();
  // Default USD (your app may override for CAD carts)
  return c === "CAD" ? "CAD" : "USD";
}

function getStripeKey(): string | null {
  // Support either env name
  const k1 = s(process.env.STRIPE_SECRET_KEY);
  const k2 = s(process.env.STRIPE_API_KEY);
  return k1 || k2 || null;
}

function makeStripe(key: string): Stripe {
  // Stripe wants the secret key; API version can be pinned if you prefer
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

export async function POST(req: Request) {
  try {
    const stripeKey = getStripeKey();
    if (!stripeKey) {
      // Do NOT throw — return JSON so builds don't crash when env isn't present.
      return NextResponse.json<ApiErr>(
        { ok: false, error: "Missing STRIPE_SECRET_KEY (or STRIPE_API_KEY). Set it in your env." },
        { status: 500 }
      );
    }

    const stripe = makeStripe(stripeKey);

    const body = (await req.json().catch(() => ({}))) as CreatePaymentIntentBody;

    const amountCents = num(body.amountCents);
    if (amountCents == null || !Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: "Invalid amountCents. Must be a positive integer." },
        { status: 400 }
      );
    }

    const currency = safeCurrency(body.currency);
    const cartId = s(body.cartId);
    const email = s(body.email);

    const metadata: Record<string, string> = {
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      ...(cartId ? { cartId } : {}),
      ...(email ? { email } : {}),
    };

    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    if (!pi.client_secret) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: "Stripe did not return a client_secret." },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiOk>({
      ok: true,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
    });
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : "Unknown error";
    return NextResponse.json<ApiErr>({ ok: false, error: msg }, { status: 500 });
  }
}
