// src/app/api/checkout/start/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { headers, cookies } from "next/headers";
import crypto from "node:crypto";
import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";

// Local asset map: your single source of truth for product images/names
import productAssetsRaw from "@/data/productAssets.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/checkout/start
 *
 * Builds a Stripe Checkout Session from the current open cart.
 *
 * Key upgrades / future-proofing:
 * - No STRIPE_SECRET_KEY access at module top-level (prevents build-time failures)
 * - requestId header + no-store
 * - cookies() compatible across Next versions
 * - origin derivation resilient behind proxies
 * - safe asset lookup for product images/names
 * - shipping line item added from cart.selectedShipping (requires selection)
 * - stable response envelope
 *
 * Notes:
 * - This endpoint creates a Stripe Checkout Session and returns { url }.
 * - If you later move to PaymentIntents only, you can keep this route as a legacy entrypoint.
 */

type Asset = {
  product_id?: number;
  name?: string;
  matched_sku?: string | null;
  cloudflare_id?: string | null;
  cloudflare_image_id?: string | null;
};

type ProductAssetRow = {
  id?: number | string | null; // local id (optional)
  sinalite_id?: number | string | null; // SinaLite id (often what your cart uses)
  sku?: string | null;
  name?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;
  cf_image_id?: string | null; // optional single fallback
  [k: string]: unknown;
};

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function getHdrs() {
  const maybe = headers() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function originFromHeaders(h: Headers) {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
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
  if (!secret) throw new Error("Missing STRIPE_SECRET_KEY (or STRIPE_API_KEY).");
  return new Stripe(secret, { apiVersion: "2026-01-28.clover" });
}

function toNum(v: unknown): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function pickCfId(r: ProductAssetRow): string | null {
  const ids = [
    r.cf_image_1_id,
    r.cf_image_2_id,
    r.cf_image_3_id,
    r.cf_image_4_id,
    r.cf_image_id,
  ];
  for (const raw of ids) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s) return s;
  }
  return null;
}

function titleCase(s?: string | null) {
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function niceName(a?: Asset, productId?: number) {
  if (!a) return `Product ${productId ?? ""}`.trim();
  return titleCase(a.name || a.matched_sku || `Product ${productId ?? ""}`);
}

function cfUrl(id?: string | null, variant = "public") {
  if (!id) return undefined;
  const hash = String(process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH || "").trim();
  return hash ? `https://imagedelivery.net/${hash}/${id}/${variant}` : undefined;
}

/* Build an index for fast lookup by either SinaLite id or local id */
const byProductId = new Map<number, Asset>();
(() => {
  const rows = (productAssetsRaw as ProductAssetRow[]) ?? [];
  for (const r of rows) {
    const cfid = pickCfId(r);
    const asset: Asset = {
      name: typeof r.name === "string" ? r.name : undefined,
      matched_sku: typeof r.sku === "string" ? r.sku : null,
      cloudflare_id: cfid,
      cloudflare_image_id: cfid,
    };

    const keys = [toNum(r.sinalite_id), toNum(r.id)].filter((n): n is number => n !== null);
    for (const key of keys) {
      if (!byProductId.has(key)) byProductId.set(key, asset);
    }
  }
})();

function safeCents(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function safeQty(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const stripe = stripeClient();

    // Load cart by cookie session
    const jar = await getJar();
    const sid =
      jar.get?.("adap_sid")?.value ??
      jar.get?.("sid")?.value ??
      "";

    if (!sid) {
      return noStoreJson(req, { ok: false as const, requestId, error: "missing_sid" }, 400);
    }

    const [cart] =
      (await db
        .select({
          id: carts.id,
          currency: carts.currency,
          selectedShipping: carts.selectedShipping,
        })
        .from(carts)
        .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
        .limit(1)) ?? [];

    if (!cart) {
      return noStoreJson(req, { ok: false as const, requestId, error: "cart_not_found" }, 404);
    }

    const selectedShipping = (cart as any)?.selectedShipping ?? null;
    if (!selectedShipping) {
      return noStoreJson(req, { ok: false as const, requestId, error: "shipping_required" }, 400);
    }

    const rows = await db
      .select({
        productId: cartLines.productId,
        quantity: cartLines.quantity,
        unitPriceCents: cartLines.unitPriceCents,
      })
      .from(cartLines)
      .where(eq(cartLines.cartId, cart.id));

    if (rows.length === 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "cart_empty" }, 400);
    }

    const currency: "USD" | "CAD" = cart.currency === "CAD" ? "CAD" : "USD";

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = rows.map((r) => {
      const pid = Number(r.productId);
      const a = byProductId.get(pid);
      const name = niceName(a, pid);
      const img = cfUrl(a?.cloudflare_id ?? a?.cloudflare_image_id);
      const unit = safeCents(r.unitPriceCents);
      const qty = safeQty(r.quantity);

      return {
        quantity: qty,
        price_data: {
          currency,
          unit_amount: unit, // cents
          product_data: {
            name,
            ...(img ? { images: [img] } : {}),
            metadata: { productId: String(pid) },
          },
        },
      };
    });

    // Add shipping line (selected earlier from SinaLite)
    const shipCarrier = String(selectedShipping?.carrier ?? "").trim();
    const shipMethod = String(selectedShipping?.method ?? "").trim();
    const shipLabel = `${shipCarrier} ${shipMethod}`.trim() || "Shipping";

    const shipCents = Math.max(0, Math.round(Number(selectedShipping?.cost || 0) * 100));
    if (shipCents > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: shipCents,
          product_data: { name: `Shipping — ${shipLabel}` },
        },
      });
    }

    const h = await getHdrs();
    const origin = originFromHeaders(h);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/checkout/success?sid=${encodeURIComponent(sid)}`,
      cancel_url: `${origin}/cart/review`,
      metadata: { cart_id: String(cart.id), sid, requestId },
      allow_promotion_codes: true,
    });

    return noStoreJson(req, { ok: true as const, requestId, url: session.url }, 200);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unknown error");
    console.error("[/api/checkout/start POST] failed", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
