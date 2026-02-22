import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/checkout/session
 *
 * Creates a Stripe Checkout Session.
 * (If you use PaymentIntents directly, keep using /api/create-payment-intent instead.)
 */

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  return crypto.randomUUID();
}

function getStripeSecret(): string | null {
  const v =
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_API_KEY ||
    process.env.STRIPE_SECRET ||
    "";
  const s = String(v).trim();
  return s ? s : null;
}

function stripeClient(): Stripe {
  const secret = getStripeSecret();
  if (!secret) {
    // Throw ONLY when invoked at runtime (not import-time).
    throw new Error("Missing STRIPE_SECRET_KEY (or STRIPE_API_KEY).");
  }

  // ✅ Must match Stripe's exported ApiVersion union in your installed stripe typings.
  return new Stripe(secret, { apiVersion: "2026-01-28.clover" });
}

// Accept either Stripe "price" reference, or "price_data" object
const LineItemSchema = z
  .object({
    // Either provide a Price ID:
    price: z.string().trim().min(1).optional(),

    // Or provide full price_data:
    price_data: z
      .object({
        currency: z.string().trim().min(3).max(4),
        unit_amount: z.number().int().nonnegative(),
        product_data: z
          .object({
            name: z.string().trim().min(1).max(200),
            description: z.string().trim().max(5000).optional(),
            images: z.array(z.string().url()).max(8).optional(),
            // Stripe expects string metadata on product_data; keep strict
            metadata: z.record(z.string(), z.string()).optional(),
          })
          .strict(),
        tax_behavior: z.enum(["exclusive", "inclusive", "unspecified"]).optional(),
      })
      .strict()
      .optional(),

    quantity: z.number().int().positive().max(100000),

    adjustable_quantity: z
      .object({
        enabled: z.boolean(),
        minimum: z.number().int().positive().optional(),
        maximum: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Boolean(v.price) !== Boolean(v.price_data), {
    message: "Provide exactly one of 'price' or 'price_data'.",
    path: ["price"],
  });

const MetadataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const BodySchema = z
  .object({
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),

    // Stripe line_items
    lineItems: z.array(LineItemSchema).min(1).max(100),

    customerEmail: z.string().email().optional(),
    clientReferenceId: z.string().trim().max(200).optional(),

    // ✅ Zod v4: z.record(keyType, valueType)
    // Keep values limited to primitives Stripe can accept after coercion.
    metadata: z.record(z.string(), MetadataValueSchema).optional(),

    allowPromotionCodes: z.boolean().optional(),
    locale: z
      .enum([
        "auto",
        "bg",
        "cs",
        "da",
        "de",
        "el",
        "en",
        "en-GB",
        "es",
        "es-419",
        "et",
        "fi",
        "fr",
        "fr-CA",
        "hr",
        "hu",
        "id",
        "it",
        "ja",
        "ko",
        "lt",
        "lv",
        "ms",
        "mt",
        "nb",
        "nl",
        "pl",
        "pt",
        "pt-BR",
        "ro",
        "ru",
        "sk",
        "sl",
        "sv",
        "th",
        "tr",
        "vi",
        "zh",
        "zh-HK",
        "zh-TW",
      ])
      .optional(),
  })
  .strict();

function coerceStripeMetadata(
  input: Record<string, string | number | boolean | null> | undefined
): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const key = (k || "").trim();
    if (!key) continue;
    if (v === null || typeof v === "undefined") continue;
    out[key] = typeof v === "string" ? v : String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function stripeErrorToStatus(err: unknown): number {
  if (err && typeof err === "object") {
    const anyErr = err as any;
    const type = String(anyErr.type || "");
    const code = String(anyErr.code || "");
    if (type.includes("StripeInvalidRequestError")) return 400;
    if (code === "parameter_invalid_integer") return 400;
    if (code === "parameter_missing") return 400;
    if (code === "resource_missing") return 400;
  }
  return 500;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const stripe = stripeClient();

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid request body",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const body = parsed.data;

    const origin = req.nextUrl.origin;
    const success_url = body.successUrl || `${origin}/checkout/success`;
    const cancel_url = body.cancelUrl || `${origin}/cart`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: body.lineItems as Stripe.Checkout.SessionCreateParams.LineItem[],
      success_url,
      cancel_url,
      customer_email: body.customerEmail,
      client_reference_id: body.clientReferenceId,
      allow_promotion_codes: body.allowPromotionCodes,
      locale: body.locale,
      metadata: coerceStripeMetadata(body.metadata),
    });

    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        id: session.id,
        url: session.url,
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    const missingSecret =
      msg.toLowerCase().includes("missing stripe_secret_key") ||
      msg.toLowerCase().includes("missing stripe_api_key");

    const status = missingSecret ? 500 : stripeErrorToStatus(err);

    return NextResponse.json(
      {
        ok: false as const,
        requestId,
        error: msg || "Checkout session creation failed",
      },
      { status, headers: { "x-request-id": requestId } }
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    { ok: false as const, requestId, error: "Method not allowed. Use POST." },
    { status: 405, headers: { "x-request-id": requestId } }
  );
}
