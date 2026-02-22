// src/app/cart/review/page.tsx
import "server-only";

import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";

import Image from "@/components/ImageSafe";
import CartArtworkThumb from "@/components/CartArtworkThumb";
import ClientToastHub from "@/components/ClientToastHub";
import HashToast from "@/components/HashToast";
import AddAnotherSideButton from "@/components/AddAnotherSideButton";
import CartShippingEstimator from "@/components/CartShippingEstimator";
import ChangeShippingButton from "@/components/ChangeShippingButton";
import CartCreditsRow from "@/components/CartCreditsRow";

import { getCartCreditsCents } from "@/lib/cartCredits";
import { cfImage } from "@/lib/cfImages";
import productAssetsRaw from "@/data/productAssets.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ----------------------------- Types ----------------------------- */
type Currency = "USD" | "CAD";

type SelectedShipping = {
  carrier: string;
  method: string;
  cost: number; // dollars
  days: number | null;
  currency: Currency;
};

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

type ApiCart = {
  id: string;
  sid?: string | null;
  status?: string | null;
  currency?: Currency | null;
};

type ApiLine = {
  id: string;
  productId: number;
  quantity: number;
  productName?: string | null;
  productCfImageId?: string | null;
  optionIds?: number[] | null;
  unitPriceCents?: number | null;
  lineTotalCents?: number | null;
};

type ApiAttachment = {
  id: string;
  fileName?: string | null;
  url?: string | null;
  cfImageId?: string | null;
  key?: string | null;
};

type ApiCurrentEnvelope = {
  ok?: boolean;
  cart: ApiCart; // IMPORTANT: non-null here
  lines: ApiLine[];
  attachments: Record<string, ApiAttachment[]>;
  selectedShipping: SelectedShipping | null;
};

type LineVM = {
  id: string;
  productId: number;
  quantity: number;
  name: string;
  unit: number; // dollars
  total: number; // dollars
  artworkUrls: string[];
  optionIds: number[];
};

type MiniLine = {
  productId: number;
  optionIds: number[];
  quantity: number;
};

/* ---------------------- Runtime JSON guards ---------------------- */
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asCurrency(v: unknown): Currency {
  return String(v || "").toUpperCase() === "CAD" ? "CAD" : "USD";
}
function asNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => asNumber(x, NaN))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.trunc(n));
}

function parseSelectedShipping(v: unknown): SelectedShipping | null {
  if (!isRecord(v)) return null;

  const carrier = asString(v.carrier).trim();
  const method = asString(v.method).trim();

  const costRaw = v.cost;
  const cost = asNumber(costRaw, 0);

  const daysRaw = v.days;
  const days =
    typeof daysRaw === "number"
      ? (Number.isFinite(daysRaw) ? daysRaw : null)
      : Number.isFinite(Number(daysRaw))
        ? Number(daysRaw)
        : null;

  const currency = asCurrency(v.currency);

  if (!carrier || !method) return null;
  return { carrier, method, cost: Number.isFinite(cost) ? cost : 0, days, currency };
}

function parseApiCurrent(x: unknown): ApiCurrentEnvelope | null {
  if (!isRecord(x)) return null;

  const cartNode = x.cart;
  if (!isRecord(cartNode)) return null;

  const cartId = asString(cartNode.id);
  if (!cartId) return null;

  const cart: ApiCart = {
    id: cartId,
    sid: asString(cartNode.sid) || null,
    status: asString(cartNode.status) || null,
    currency: asCurrency(cartNode.currency),
  };

  const linesNode = x.lines;
  const lines: ApiLine[] = Array.isArray(linesNode)
    ? linesNode
        .map((ln): ApiLine | null => {
          if (!isRecord(ln)) return null;
          const id = asString(ln.id);
          const productId = Math.trunc(asNumber(ln.productId, 0));
          const quantity = Math.trunc(asNumber(ln.quantity, 0));
          if (!id || productId <= 0) return null;

          return {
            id,
            productId,
            quantity: quantity > 0 ? quantity : 1,
            productName: asString(ln.productName) || null,
            productCfImageId: asString(ln.productCfImageId) || null,
            optionIds: Array.isArray(ln.optionIds) ? asNumberArray(ln.optionIds) : null,
            unitPriceCents: Number.isFinite(asNumber(ln.unitPriceCents, NaN))
              ? Math.trunc(asNumber(ln.unitPriceCents, 0))
              : null,
            lineTotalCents: Number.isFinite(asNumber(ln.lineTotalCents, NaN))
              ? Math.trunc(asNumber(ln.lineTotalCents, 0))
              : null,
          };
        })
        .filter((v): v is ApiLine => !!v)
    : [];

  const attachments: Record<string, ApiAttachment[]> = {};
  const attNode = x.attachments;
  if (isRecord(attNode)) {
    for (const [lineId, list] of Object.entries(attNode)) {
      const arr = Array.isArray(list) ? list : [];
      attachments[lineId] = arr
        .map((a): ApiAttachment | null => {
          if (!isRecord(a)) return null;
          const id = asString(a.id);
          if (!id) return null;
          return {
            id,
            fileName: asString(a.fileName) || null,
            url: asString(a.url) || null,
            cfImageId: asString(a.cfImageId) || null,
            key: asString(a.key) || null,
          };
        })
        .filter((v): v is ApiAttachment => !!v);
    }
  }

  const selectedShipping =
    parseSelectedShipping(x.selectedShipping) ??
    parseSelectedShipping((cartNode as any).selectedShipping);

  return {
    ok: typeof x.ok === "boolean" ? x.ok : undefined,
    cart,
    lines,
    attachments,
    selectedShipping: selectedShipping ?? null,
  };
}

/* ----------------------- CF image helpers ------------------------ */
const CARD_VARIANT = "productThumb" as const;
const CF_PLACEHOLDER_ID = "a90ba357-76ea-48ed-1c65-44fff4401600";

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

const productAssetById = new Map<number, ProductAsset>();
for (const p of productAssetsRaw as ProductAsset[]) {
  const id = Number(p?.id);
  if (Number.isFinite(id) && !productAssetById.has(id)) productAssetById.set(id, p);
}

function cartLineImageUrl(productId?: number | string | null): string {
  const pid = Number(productId);
  const row = Number.isFinite(pid) ? productAssetById.get(pid) : undefined;
  const ref = firstCfIdFromAsset(row) ?? CF_PLACEHOLDER_ID;
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  return cfImage(ref, CARD_VARIANT) || cfImage(ref, "public") || "/placeholder.svg";
}

function nameFallback(productId?: number | string | null): string {
  const pid = Number(productId);
  const row = Number.isFinite(pid) ? productAssetById.get(pid) : undefined;
  return (row?.name && titleCase(row.name)) || (row?.sku ?? "") || (pid ? `Product ${pid}` : "Product");
}

function moneyFmt(amount: number, currency: Currency) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/* ---------------------------- Fetch cart ------------------------- */
async function getBaseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${proto}://${host}`;
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

async function loadCart(): Promise<{ cart: ApiCart; lines: LineVM[]; selectedShipping: SelectedShipping | null } | null> {
  const base = await getBaseUrl();

  const h = await headers();
  const cookieHeader = h.get("cookie") ?? "";

  const res = await fetch(`${base}/api/cart/current`, {
    cache: "no-store",
    next: { revalidate: 0 },
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (!res.ok) return null;

  const raw = (await res.json().catch(() => null)) as unknown;
  const parsed = parseApiCurrent(raw);
  if (!parsed) return null;

  const lines: LineVM[] = (parsed.lines || []).map((r) => {
    const unit = (typeof r.unitPriceCents === "number" ? r.unitPriceCents : 0) / 100;
    const total = (typeof r.lineTotalCents === "number" ? r.lineTotalCents : 0) / 100;

    const art = parsed.attachments?.[String(r.id)] ?? [];
    const artworkUrls = art.map((a) => a.url).filter((u): u is string => typeof u === "string" && !!u);

    return {
      id: String(r.id),
      productId: Number(r.productId),
      quantity: Number(r.quantity ?? 1),
      name: r.productName || nameFallback(r.productId),
      unit,
      total,
      artworkUrls,
      optionIds: Array.isArray(r.optionIds) ? r.optionIds : [],
    };
  });

  return { cart: parsed.cart, lines, selectedShipping: parsed.selectedShipping };
}

/* ------------------------------ Page ------------------------------ */
export default async function ReviewCartPage() {
  const data = await loadCart();

  if (!data || data.lines.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-2xl border bg-white/80 p-10 text-center shadow-sm backdrop-blur">
          <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
          <p className="mt-3 text-neutral-600">Your cart is empty.</p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
          >
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  const { cart, lines, selectedShipping } = data;
  const currency: Currency = asCurrency(cart.currency);

  // Clerk auth() is async in Next 15
  const { userId } = await auth();

  // Default address is optional; avoid TS signature mismatch by calling via `any`.
  let defaultAddr: any = null;
  if (userId) {
    try {
      const mod: any = await import("@/lib/addresses");
      const fn: any = mod?.getDefaultAddress;
      defaultAddr = typeof fn === "function" ? await fn(userId) : null;
    } catch {
      defaultAddr = null;
    }
  }

  const initCountry = (defaultAddr?.country === "CA" ? "CA" : "US") as "US" | "CA";
  const initState = typeof defaultAddr?.state === "string" ? defaultAddr.state : "";
  const initZip = typeof defaultAddr?.postalCode === "string" ? defaultAddr.postalCode : "";

  const subtotal = lines.reduce((acc, l) => acc + (Number(l.total) || 0), 0);
  const shipping = Number(selectedShipping?.cost ?? 0) || 0;
  const tax = 0;

  const creditsCents = await getCartCreditsCents(cart.id);
  const credits = Math.max(0, (creditsCents || 0) / 100);
  const grandTotal = Math.max(0, subtotal + shipping + tax - credits);

  const miniLines: MiniLine[] = lines.map((l) => ({
    productId: l.productId,
    optionIds: Array.isArray(l.optionIds) ? l.optionIds : [],
    quantity: l.quantity || 1,
  }));

  const shippingSelected = Boolean(selectedShipping);
  const ss = selectedShipping; // local alias for JSX narrowing (we’ll guard it)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <ClientToastHub />
      <HashToast />

      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Review your order</h1>
          <p className="mt-1 text-sm text-neutral-600">Make sure everything looks perfect before checkout.</p>
        </div>
        <Link
          href="/cart"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50"
        >
          Back to cart
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* LEFT: Lines */}
        <section className="space-y-4 lg:col-span-8">
          {lines.map((line) => {
            const productImg = cartLineImageUrl(line.productId);
            const hasArtwork = (line.artworkUrls?.length ?? 0) > 0;

            return (
              <article key={line.id} className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="overflow-hidden rounded-xl border">
                      <Image
                        src={productImg}
                        alt={line.name}
                        width={88}
                        height={88}
                        className="h-22 w-22 object-cover"
                        unoptimized
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold">{line.name}</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          Qty {line.quantity}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-neutral-600">{moneyFmt(line.unit, currency)} each</div>

                      {hasArtwork ? (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {line.artworkUrls.map((u, i) => (
                            <CartArtworkThumb key={`${line.id}-art-${i}`} url={u} alt={`Artwork side ${i + 1}`} />
                          ))}
                          <AddAnotherSideButton
                            productId={line.productId}
                            lineId={line.id}
                            currentSides={line.artworkUrls.length}
                          />
                        </div>
                      ) : (
                        <div className="mt-3">
                          <AddAnotherSideButton
                            productId={line.productId}
                            lineId={line.id}
                            currentSides={0}
                            label="Upload artwork"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold">{moneyFmt(line.total, currency)}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* RIGHT: Summary */}
        <aside className="lg:col-span-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-base font-semibold">Order summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Subtotal</span>
                <span className="font-medium">{moneyFmt(subtotal, currency)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-neutral-600">
                  Shipping{ss?.method ? ` — ${ss.method}` : " (estimated)"}
                </span>
                <span className="font-medium">{moneyFmt(shipping, currency)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Tax</span>
                <span className="font-medium">{moneyFmt(0, currency)}</span>
              </div>

              <CartCreditsRow creditsCents={creditsCents} currency={currency} />

              <hr className="my-3" />

              <div className="flex items-center justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-extrabold">{moneyFmt(grandTotal, currency)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-5 shadow-sm ring-1 ring-black/5">
            {!shippingSelected ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Shipping estimator</h3>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    Required to continue
                  </span>
                </div>

                <CartShippingEstimator
                  initialCountry={initCountry}
                  initialState={initState}
                  initialZip={initZip}
                  lines={miniLines}
                  currency={currency}
                />
              </>
            ) : ss ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Selected shipping</span>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {ss.days ?? "–"} business {ss.days === 1 ? "day" : "days"}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm text-gray-600">
                    {ss.carrier} — {ss.method}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold">{moneyFmt(Number(ss.cost || 0), currency)}</div>
                  <ChangeShippingButton />
                </div>
              </div>
            ) : (
              // ultra-safe fallback if selectedShipping was truthy but malformed
              <div className="text-sm text-gray-600">Shipping selected.</div>
            )}
          </div>

          <div className="mt-4">
            <Link
              href="/checkout"
              className={`inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white shadow hover:bg-blue-800 ${
                !shippingSelected ? "pointer-events-none opacity-50" : ""
              }`}
              aria-disabled={!shippingSelected}
            >
              Continue to checkout
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}