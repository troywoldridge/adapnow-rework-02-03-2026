import "server-only";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers, cookies } from "next/headers";

import CartPageClient from "./CartPageClient";
import type { ShippingRate } from "@/components/CartShippingEstimator";

type Currency = "USD" | "CAD";

type ApiEnvelope = {
  ok: true;
  cart?: { id: string; sid: string; status: string; currency?: Currency } | null;
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
  // legacy fields (some endpoints might still return these)
  items?: Array<{
    id: string;
    productId: number;
    quantity: number;
    optionIds: number[];
    unitPrice?: number;
    lineTotal?: number;
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

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

function cookieHeaderFromJar(jar: ReturnType<typeof cookies>): string {
  // cookies() is synchronous in Next; do not await it.
  const list = jar.getAll();
  return list.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function fetchCart(): Promise<{
  items: ClientItem[];
  currency: Currency;
  initialShipping: ShippingRate | null;
}> {
  const url = `${await baseUrl()}/api/cart/current`;

  // forward cookies so the API sees the same session
  const jar = cookies();
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
  if (!json) return { items: [], currency: "USD", initialShipping: null };

  const currency: Currency = json.currency === "CAD" ? "CAD" : "USD";
  const initialShipping: ShippingRate | null = json.selectedShipping ?? null;

  // Prefer `lines` (new canonical shape)
  if (Array.isArray(json.lines) && json.lines.length) {
    const items: ClientItem[] = json.lines.map((ln) => ({
      id: String(ln.id),
      productId: Number(ln.productId),
      name: ln.productName ?? `Product ${ln.productId}`,
      optionIds: Array.isArray(ln.optionIds) ? (ln.optionIds as number[]) : [],
      quantity: Number.isFinite(Number(ln.quantity)) ? Number(ln.quantity) : 1,
      cloudflareImageId: ln.productCfImageId ?? null,
      serverUnitPrice: typeof ln.unitPriceCents === "number" ? ln.unitPriceCents / 100 : undefined,
    }));

    return { items, currency, initialShipping };
  }

  // Fallback: `items` (legacy shape)
  const itemsLegacy = Array.isArray(json.items) ? json.items : [];
  const items: ClientItem[] = itemsLegacy.map((it: any) => ({
    id: String(it.id),
    productId: Number(it.productId),
    name: it.name ?? `Product ${it.productId}`,
    optionIds: Array.isArray(it.optionIds) ? it.optionIds : [],
    quantity: Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 1,
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
        initialItems={items as any}
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
