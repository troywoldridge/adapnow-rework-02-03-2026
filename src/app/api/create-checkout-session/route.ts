// src/app/api/create-checkout-session/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import Stripe from "stripe";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";
import { cartLines } from "@/lib/db/schema/cartLines";

// Cloudflare Images helper + local product assets (served via Cloudflare CDN)
import { cfImage } from "@/lib/cfImages";
import productAssetsRaw from "@/data/productAssets.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/create-checkout-session
 *
 * Legacy-compatible endpoint (some UI flows still call this).
 * Internally mirrors /api/checkout/start behavior:
 * - builds Stripe Checkout Session from the current open cart
 * - returns { ok:true, url }
 *
 * Future-proofing:
 * - No top-level Stripe secret reads (safe in Next build environments)
 * - requestId header + no-store
 * - resilient cookies()/headers() across Next versions
 * - stable response envelope + good errors
 */

type ProductAsset = {
  id?: number | string | null;
  sku?: string | null;
  name?: string | null;
  cf_image_id?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;
  cloudflare_id?: string | null;
  cloudflare_image_id?: string | null;
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

async function getHdrs(): Promise<Headers> {
  const maybe = headers() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function getJar(): Promise<any> {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function originFromHeaders(h: Headers): string {
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

function safeQty(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function safeCents(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/* ---------------- assets index ---------------- */

const assetsById = new Map<number, ProductAsset>();
for (const p of productAssetsRaw as ProductAsset[]) {
  const id = Number((p as any)?.id);
  if (Number.isFinite(id) && !assetsById.has(id)) assetsById.set(id, p);
}

function titleCase(s?: string | null) {
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstCfIdFromAsset(p?: ProductAsset | null): string | null {
  if (!p) return null;
  const refs = [
    p.cf_image_1_id,
    p.cf_image_2_id,
    p.cf_image_3_id,
    p.cf_image_4_id,
    p.cf_image_id,
    p.cloudflare_image_id,
    p.cloudflare_id,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return refs[0] || null;
}

function productName(productId: number): string {
  const row = assetsById.get(productId);
  return (
    (row?.name && titleCase(row.name)) ||
    (typeof row?.sku === "string" && row.sku.trim() ? row.sku.trim() : "") ||
    (Number.isFinite(productId) ? `Product ${productId}` : "Product")
  );
}

function productSku(productId: number): string | undefined {
  const row = assetsById.get(productId);
  return typeof row?.sku === "string" && row.sku.trim() ? row.sku.trim() : undefined;
}

function productImageUrl(productId: number): string | undefined {
  const row = assetsById.get(productId);
  const id = firstCfIdFromAsset(row);
  if (!id) return undefined;
  // Serve through Cloudflare CDN variants
  return cfImage(id, "productCard") || cfImage(id, "public") || undefined;
}

/* ---------------- handler ---------------- */

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const stripe = stripeClient();

    const h = await getHdrs();
    const origin = originFromHeaders(h);

    const jar = await getJar();
    const sid = jar.get?.("adap_sid")?.value ?? jar.get?.("sid")?.value ?? null;

    if (!sid) {
      return noStoreJson(req, { ok: false as const, requestId, error: "missing_sid" }, 400);
    }

    // Load open cart
    const [cartRow] =
      (await db
        .select({
          id: carts.id,
          status: carts.status,
          currency: carts.currency,
          selectedShipping: carts.selectedShipping,
        })
        .from(carts)
        .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
        .limit(1)) ?? [];

    if (!cartRow) {
      return noStoreJson(req, { ok: false as const, requestId, error: "cart_not_found" }, 404);
    }

    // Load lines
    const lineRows = await db
      .select({
        productId: cartLines.productId,
        quantity: cartLines.quantity,
        unitPriceCents: cartLines.unitPriceCents,
        lineTotalCents: cartLines.lineTotalCents,
        optionIds: cartLines.optionIds,
      })
      .from(cartLines)
      .where(eq(cartLines.cartId, cartRow.id));

    if (lineRows.length === 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "empty_cart" }, 400);
    }

    const ship = (cartRow as any)?.selectedShipping ?? null;
    if (!ship) {
      return noStoreJson(req, { ok: false as const, requestId, error: "shipping_required" }, 400);
    }

    // Build Stripe line_items
    const currency = (cartRow.currency === "CAD" ? "cad" : "usd") as "usd" | "cad";

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const r of lineRows) {
      const pid = Number(r.productId);
      const qty = safeQty(r.quantity);
      const unit = safeCents(r.unitPriceCents);

      const name = productName(pid);
      const imageUrl = productImageUrl(pid);
      const sku = productSku(pid);

      // Keep metadata stable for downstream reconciliation
      const metadata: Record<string, string> = {
        productId: String(pid),
        ...(sku ? { sku } : {}),
      };

      line_items.push({
        quantity: qty,
        price_data: {
          currency,
          unit_amount: unit,
          product_data: {
            name,
            ...(imageUrl ? { images: [imageUrl] } : {}),
            metadata,
          },
        },
      });
    }

    // Shipping line
    const shippingCents = Math.max(0, Math.round(Number(ship?.cost ?? 0) * 100));
    if (shippingCents > 0) {
      const label = String(ship?.method ?? ship?.carrier ?? "Shipping").trim() || "Shipping";
      line_items.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: shippingCents,
          product_data: { name: `Shipping — ${label}` },
        },
      });
    }

    // URLs (success uses Stripe session_id token)
    const success_url = `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${origin}/cart/review#checkout_canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      allow_promotion_codes: true,
      metadata: { sid, cartId: String(cartRow.id), requestId },
      success_url,
      cancel_url,
    });

    return noStoreJson(req, { ok: true as const, requestId, url: session.url }, 200);
  } catch (e: any) {
    console.error("[/api/create-checkout-session POST] failed", e?.message || e);
    return noStoreJson(req, { ok: false as const, requestId, error: String(e?.message || e) }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
