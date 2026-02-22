// src/app/cart/page.tsx
import "server-only";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers, cookies } from "next/headers";

import CartPageClient from "./CartPageClient";
import type { ShippingRate } from "@/components/CartShippingEstimator";

type Currency = "USD" | "CAD";

type ApiEnvelope = {
  ok: boolean;

  cart?: { id: string; sid: string; status: string; currency?: Currency } | null;

  // New canonical shape
  lines?: Array<{
    id: string;
    productId: number;
    quantity: number;
    optionIds?: number[] | null;
    productName?: string | null;
    productCfImageId?: string | null;
    unitPriceCents?: number | null;
    lineTotalCents?: number | null;
  }>;

  // Legacy shape
  items?: Array<{
    id: string;
    productId: number;
    quantity: number;
    optionIds: number[];
    unitPrice?: number; // dollars
    lineTotal?: number; // dollars
    name?: string | null;
    image?: string | null;
  }>;

  subtotal?: number;
  currency?: Currency;
  selectedShipping?: ShippingRate | null;
};

type ClientItem = {
  id: string;
  productId: number;
  name?: string | null;
  optionIds: number[];
  quantity: number;
  cloudflareImageId?: string | null;
  serverUnitPrice?: number; // dollars
};

function toCurrency(v: unknown): Currency {
  const x = String(v ?? "").toUpperCase();
  return x === "CAD" ? "CAD" : "USD";
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(v: unknown, fallback: number): number {
  const n = toNumber(v, NaN);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function baseUrl(): Promise<string> {
  // In your project typings, headers() is async.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;

function cookieHeaderFromJar(jar: CookieJar): string {
  const list = jar.getAll();
  return list.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function fetchCart(): Promise<{
  items: ClientItem[];
  currency: Currency;
  initialShipping: ShippingRate | null;
}> {
  const url = `${await baseUrl()}/api/cart/current`;

  // Forward cookies so the API sees the same session
  const jar = await cookies();
  const cookieHeader = cookieHeaderFromJar(jar);

  const res = await fetch(url, {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      accept: "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });

  if (!res.ok) return { items: [], currency: "USD", initialShipping: null };

  const json = (await res.json().catch(() => null)) as ApiEnvelope | null;
  if (!json || typeof json !== "object") return { items: [], currency: "USD", initialShipping: null };

  const currency: Currency = toCurrency(json.currency);
  const initialShipping: ShippingRate | null = (json.selectedShipping ?? null) as ShippingRate | null;

  // Prefer `lines`
  if (Array.isArray(json.lines) && json.lines.length) {
    const items: ClientItem[] = json.lines.map((ln) => ({
      id: String(ln.id),
      productId: toInt(ln.productId, 0),
      name: ln.productName ?? `Product ${ln.productId}`,
      optionIds: Array.isArray(ln.optionIds) ? (ln.optionIds as number[]) : [],
      quantity: Math.max(1, toInt(ln.quantity, 1)),
      cloudflareImageId: ln.productCfImageId ?? null,
      serverUnitPrice: typeof ln.unitPriceCents === "number" ? ln.unitPriceCents / 100 : undefined,
    }));

    return { items, currency, initialShipping };
  }

  // Fallback: `items`
  const legacy = Array.isArray(json.items) ? json.items : [];
  const items: ClientItem[] = legacy.map((it) => ({
    id: String(it.id),
    productId: toInt(it.productId, 0),
    name: it.name ?? `Product ${it.productId}`,
    optionIds: Array.isArray(it.optionIds) ? it.optionIds : [],
    quantity: Math.max(1, toInt(it.quantity, 1)),
    cloudflareImageId: it.image ?? null,
    serverUnitPrice: typeof it.unitPrice === "number" ? it.unitPrice : undefined,
  }));

  return { items, currency, initialShipping };
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

      <div className="mt-6 flex justify-end">
        <Link
          href={hasItems ? "/cart/review" : "#"}
          className={`inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white shadow hover:bg-blue-800 ${
            hasItems ? "" : "pointer-events-none opacity-50"
          }`}
          aria-disabled={!hasItems}
        >
          Review &amp; Get Rates
        </Link>
      </div>
    </>
  );
}