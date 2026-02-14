// src/app/cart/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";

import CartPageClient from "./CartPageClient";
import type { CartItem } from "@/components/CartLineItem";
import type { ShippingRate } from "@/components/cart/CartShippingEstimator";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Currency = "USD" | "CAD";

type ApiEnvelope = {
  ok: true;

  cart:
    | { id: string; sid: string; status: string; currency?: Currency | null }
    | null;

  // ✅ canonical shape
  lines: Array<{
    id: string;
    productId: number;
    productName?: string | null;
    productCfImageId?: string | null;
    quantity: number;
    unitPriceCents?: number | null;
    lineTotalCents?: number | null;
    optionChain?: string | null;
  }>;

  attachments?: Record<string, unknown>;
  selectedShipping?: ShippingRate | null;

  // optional/compat fields
  currency?: Currency;
  subtotal?: number;
  subtotalCents?: number;
};

function absBaseFromEnv(): string | null {
  const v =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "";

  return v ? v : null;
}

async function baseUrlFromRequest(): Promise<string> {
  const h = await headers();

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");

  return `${proto}://${host}`;
}

async function absBase(): Promise<string> {
  return absBaseFromEnv() ?? (await baseUrlFromRequest());
}

export async function generateMetadata(): Promise<Metadata> {
  const base = await absBase();
  const canonical = `${base}/cart`;

  const brand = site?.name ?? "Legendary Collectibles";

  return {
    title: `Cart | ${brand}`,
    description: `Review your cart and proceed to checkout.`,
    alternates: { canonical },

    // ✅ Carts should generally not be indexed
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
        noimageindex: true,
      },
    },
  };
}

function toCurrency(v: unknown): Currency {
  return v === "CAD" ? "CAD" : "USD";
}

function toQty(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const m = Math.floor(n);
  return m > 0 ? m : 1;
}

async function fetchCart(): Promise<{
  items: CartItem[];
  currency: Currency;
  initialShipping: ShippingRate | null;
}> {
  const url = `${await absBase()}/api/cart/current`;

  // forward cookies so the API sees the same session
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
      },
    });

    if (!res.ok) return { items: [], currency: "USD", initialShipping: null };

    const json = (await res.json()) as Partial<ApiEnvelope> & Record<string, unknown>;
    if (!json?.ok) return { items: [], currency: "USD", initialShipping: null };

    // Prefer cart.currency, fallback to top-level currency, else USD
    const currency: Currency = toCurrency(json.cart?.currency ?? json.currency ?? "USD");

    const rawLines = Array.isArray(json.lines) ? json.lines : [];

    const items: CartItem[] = rawLines.map((ln) => {
      const unit =
        typeof ln.unitPriceCents === "number" && Number.isFinite(ln.unitPriceCents)
          ? ln.unitPriceCents / 100
          : undefined;

      return {
        id: String(ln.id),
        productId: Number(ln.productId),
        name: (ln.productName ?? `Product ${ln.productId}`) as string,
        optionIds: [], // optionIds aren't returned by /api/cart/current yet
        quantity: toQty(ln.quantity),
        cloudflareImageId: ln.productCfImageId ?? null,
        serverUnitPrice: unit,
      };
    });

    const initialShipping: ShippingRate | null =
      (json.selectedShipping as ShippingRate | null) ?? null;

    return { items, currency, initialShipping };
  } catch (e) {
    console.error("fetchCart error", e);
    return { items: [], currency: "USD", initialShipping: null };
  }
}

export default async function CartPage() {
  const { items, currency, initialShipping } = await fetchCart();
  const store = currency === "CAD" ? "CA" : "US";
  const hasItems = items.length > 0;

  return (
    <>
      <CartPageClient
        initialItems={items}
        currency={currency}
        store={store}
        initialShipping={initialShipping}
      />

      {/* CTA: move rates to the Review step */}
      <div className="mt-6 flex justify-end" aria-label="Cart actions">
        <Link
          href={hasItems ? "/cart/review" : "/cart"}
          className={`btn primary ${hasItems ? "" : "pointer-events-none opacity-50"}`}
          aria-disabled={!hasItems}
        >
          Review &amp; Get Rates
        </Link>
      </div>
    </>
  );
}
