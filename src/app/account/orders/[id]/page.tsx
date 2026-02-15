// src/app/account/orders/[id]/page.tsx
import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { eq, inArray, sql } from "drizzle-orm";

import Image from "@/components/ImageSafe";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";
import { cartLines } from "@/lib/db/schema/cartLines";
import { cartArtwork } from "@/lib/db/schema/cartArtwork";

import { cfImage } from "@/lib/cfImages";
import productAssetsRaw from "@/data/productAssets.json";

import ShipmentTimeline from "./ShipmentTimeline";

/* ------------------------------ env helpers ------------------------------ */
function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const s = String(v).trim();
  return s || null;
}

function cleanId(s: unknown): string {
  return String(s ?? "").trim();
}

/* ------------------------------ SEO (PRIVATE PAGE) ------------------------------ */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Order details | American Design And Printing",
    description: "View order status, items, invoices, and tracking details.",
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        "max-image-preview": "none",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

/* ------------------------------ helpers ------------------------------ */
type ProductAsset = {
  id?: number | string | null;
  name?: string | null;
  sku?: string | null;
  slug?: string | null;

  cf_image_id?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;

  cloudflare_id?: string | null;
  cloudflare_image_id?: string | null;
  [k: string]: unknown;
};

type SinaliteProductRow = {
  product_id: number;
  name: string | null;
  sku: string | null;
  raw_json?: unknown;
  category?: string | null;
  enabled?: boolean | null;
};

const CARD_VARIANT = "productThumb" as const;

const CF_PLACEHOLDER_ID =
  readEnv("NEXT_PUBLIC_CF_LOGO_ID") ||
  readEnv("CF_LOGO_ID") ||
  "a90ba357-76ea-48ed-1c65-44fff4401600";

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
  if (Number.isFinite(id) && !productAssetById.has(id)) {
    productAssetById.set(id, p);
  }
}

function moneyFmt(cents: number, currency: "USD" | "CAD") {
  const dollars = (Number(cents) || 0) / 100;
  const locale = currency === "CAD" ? "en-CA" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(dollars);
}

function niceDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function clampStr(s: unknown, max = 80): string {
  const v = String(s ?? "").trim();
  if (!v) return "";
  return v.length <= max ? v : v.slice(0, max - 1) + "…";
}

function normalizeIntList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const STATUS_STYLES: Record<string, string> = {
  fulfilled: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  processing: "bg-amber-50 text-amber-800 ring-amber-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  placed: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  default: "bg-gray-50 text-gray-700 ring-gray-200",
};

function buildProductImageUrl(productId?: number | string | null): string {
  const pid = Number(productId);
  const row = Number.isFinite(pid) ? productAssetById.get(pid) : undefined;
  const ref = firstCfIdFromAsset(row) ?? CF_PLACEHOLDER_ID;

  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;

  return cfImage(ref, CARD_VARIANT) || cfImage(ref, "public") || "/placeholder.svg";
}

/* ------------------------------ types for selects ------------------------------ */
type OrderRow = typeof orders.$inferSelect;

type LineRow = {
  id: string;
  productId: number | string;
  quantity: number | string;
  unitPriceCents: number | string | null;
  lineTotalCents: number | string | null;
  optionIds: (number | string)[] | null;
};

/* ------------------------------ db helpers (sinalite_products) ------------------------------ */
async function loadSinaliteProductsByIds(productIds: number[]): Promise<Map<number, SinaliteProductRow>> {
  const ids = Array.from(new Set(productIds.filter((n) => Number.isFinite(n) && n > 0)));
  const map = new Map<number, SinaliteProductRow>();
  if (!ids.length) return map;

  const rows = (await db.execute(
    sql`SELECT product_id, name, sku, raw_json, category, enabled
        FROM sinalite_products
        WHERE product_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
  )) as any;

  const rawRows: any[] = Array.isArray(rows?.rows) ? rows.rows : Array.isArray(rows) ? rows : [];

  for (const r of rawRows) {
    const pid = Number(r?.product_id);
    if (!Number.isFinite(pid)) continue;
    map.set(pid, {
      product_id: pid,
      name: r?.name ?? null,
      sku: r?.sku ?? null,
      raw_json: r?.raw_json,
      category: r?.category ?? null,
      enabled: typeof r?.enabled === "boolean" ? r.enabled : null,
    });
  }

  return map;
}

/* ------------------------------ loader ------------------------------ */
async function loadOrder(orderIdRaw: string) {
  const orderId = cleanId(orderIdRaw);
  if (!orderId) return null;

  const { userId } = await auth();

  const jar = await cookies();
  const sid = jar.get("adap_sid")?.value ?? jar.get("sid")?.value ?? null;

  const { select, update } = db;

  const o =
    (await select().from(orders).where(eq(orders.id, orderId)).limit(1))?.[0] as OrderRow | undefined;

  if (!o) return null;

  // Ownership (guest → user claim)
  const owner = String((o as any).userId ?? "");
  const candidates = [userId, sid].filter(Boolean).map(String);

  if (!candidates.includes(owner)) {
    if (userId && sid && owner === String(sid)) {
      await update(orders).set({ userId }).where(eq(orders.id, orderId));
      (o as any).userId = userId;
    } else {
      return null;
    }
  }

  const cartId = (o as any).cartId as string | null | undefined;

  const lineRows: LineRow[] = cartId
    ? ((await select({
        id: cartLines.id,
        productId: cartLines.productId,
        quantity: cartLines.quantity,
        unitPriceCents: cartLines.unitPriceCents,
        lineTotalCents: cartLines.lineTotalCents,
        optionIds: cartLines.optionIds,
      })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartId))) as unknown as LineRow[])
    : [];

  // Artwork by line
  const artMap = new Map<string, string[]>();
  if (lineRows.length) {
    const ids = lineRows.map((l) => String(l.id)).filter(Boolean);
    if (ids.length) {
      const arts = (await select({
        cartLineId: cartArtwork.cartLineId,
        url: cartArtwork.url,
      })
        .from(cartArtwork)
        .where(inArray(cartArtwork.cartLineId, ids as string[]))) as unknown as Array<{
        cartLineId: string;
        url: string;
      }>;

      for (const a of arts) {
        const key = String(a.cartLineId);
        if (!artMap.has(key)) artMap.set(key, []);
        artMap.get(key)!.push(String(a.url));
      }
    }
  }

  return { o, lines: lineRows, artMap };
}

/* ------------------------------ page ------------------------------ */
export default async function OrderDetailsPage({ params }: { params: { id: string } }) {
  const data = await loadOrder(params.id);
  if (!data) notFound();

  const { o, lines, artMap } = data;

  const currency = (o.currency === "CAD" ? "CAD" : "USD") as "USD" | "CAD";
  const status = String((o as any).status || "placed").toLowerCase();
  const statusClass = STATUS_STYLES[status] || STATUS_STYLES.default;

  const subtotal = Number((o as any).subtotalCents) || 0;
  const ship = Number((o as any).shippingCents) || 0;
  const tax = Number((o as any).taxCents) || 0;
  const credits = Number((o as any).creditsCents ?? 0);
  const total = Number((o as any).totalCents) || 0;

  const placedAt = (o as any).placedAt ?? (o as any).createdAt;
  const orderNumber = (o as any).orderNumber ? String((o as any).orderNumber) : null;

  const productIds = lines
    .map((l) => Number((l as any).productId))
    .filter((n) => Number.isFinite(n) && n > 0);

  const sinaliteProducts = await loadSinaliteProductsByIds(productIds);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-transparent bg-gradient-to-br from-indigo-600 via-indigo-500 to-blue-500 p-[1px] shadow-lg">
        <div className="rounded-3xl bg-white/95 p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                {orderNumber ? `Order #${orderNumber}` : `Order ${String(o.id).slice(0, 8)}`}
              </h1>

              <p className="mt-1 text-sm text-gray-600">
                Placed {niceDate(String(placedAt || ""))} •{" "}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClass}`}
                >
                  {clampStr(status, 40)}
                </span>

                {(o as any).paymentStatus ? (
                  <>
                    {" "}
                    •{" "}
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                      {clampStr((o as any).paymentStatus, 40)}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/account/orders/${String(o.id)}/invoice`}
                className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
              >
                View / Download PDF
              </Link>

              <form action={`/api/orders/${String(o.id)}/invoice/email`} method="post" className="print:hidden">
                <button
                  className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
                  formMethod="post"
                >
                  Email me this invoice
                </button>
              </form>

              <a
                href={`/api/orders/${String(o.id)}/artwork.zip`}
                className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
              >
                Download artwork (.zip)
              </a>

              {/* ✅ Reorder must be POST (state-changing) */}
              <form action={`/account/orders/${String(o.id)}/reorder`} method="post">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Reorder
                </button>
              </form>

              {/* Optional: edit quantities before adding */}
              <Link
                href={`/account/orders/${String(o.id)}/reorder/edit`}
                className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
              >
                Adjust quantities
              </Link>
            </div>

            {/* Optional "More actions" (non-blocking, tucked away) */}
            <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
              <form action={`/account/orders/${String(o.id)}/reorder?mode=replace`} method="post">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl bg-white px-4 py-2 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
                  title="Replace your current cart items with this order"
                >
                  Reorder (replace cart)
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: items */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Items</h2>
            <Link href="/products" className="text-xs font-semibold text-indigo-700 hover:underline">
              Continue shopping →
            </Link>
          </div>

          <ul className="space-y-4">
            {lines.map((l) => {
              const pid = Number((l as any).productId);
              const row = Number.isFinite(pid) ? sinaliteProducts.get(pid) : undefined;

              const name =
                (row?.name && String(row.name).trim()) ||
                (Number.isFinite(pid) ? `Product ${pid}` : "Product");

              const sku = (row?.sku && String(row.sku).trim()) || null;

              const qty = Math.max(0, Number((l as any).quantity ?? 0) || 0);
              const unit = Math.max(0, Number((l as any).unitPriceCents ?? 0) || 0);

              const providedLineTotal = Number((l as any).lineTotalCents);
              const computedLineTotal = unit * qty;
              const lineTotal = Number.isFinite(providedLineTotal) ? providedLineTotal : computedLineTotal;

              const imageUrl = buildProductImageUrl(pid);
              const arts = artMap.get(String((l as any).id)) ?? [];
              const optIds = normalizeIntList((l as any).optionIds);

              return (
                <li key={String((l as any).id)} className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex gap-4">
                    <Image
                      src={imageUrl}
                      alt={name}
                      width={96}
                      height={96}
                      className="rounded-xl border object-cover"
                      unoptimized
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="block truncate text-sm font-semibold text-gray-900">{name}</div>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                            {sku ? <span>SKU: {sku}</span> : null}
                            {Number.isFinite(pid) ? <span>ID: {pid}</span> : null}
                            <span>Qty: {qty}</span>
                            <span>Unit: {moneyFmt(unit, currency)}</span>
                          </div>

                          {optIds.length ? (
                            <div className="mt-2 rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">Options:</span>{" "}
                              {optIds.slice(0, 24).join(", ")}
                              {optIds.length > 24 ? " …" : ""}
                            </div>
                          ) : null}

                          {arts.length > 0 && (
                            <div className="mt-3">
                              <div className="text-xs font-semibold text-gray-700">Artwork</div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {arts.slice(0, 6).map((u, i) => (
                                  <a
                                    key={`${String((l as any).id)}-art-thumb-${i}`}
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group relative overflow-hidden rounded-lg border bg-white"
                                    title={`Artwork ${i + 1}`}
                                  >
                                    <img
                                      src={u}
                                      alt={`Artwork ${i + 1}`}
                                      className="h-12 w-12 object-cover"
                                      loading="lazy"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100">
                                      {i + 1}
                                    </span>
                                  </a>
                                ))}

                                {arts.length > 6 ? (
                                  <span className="text-xs text-gray-500">+{arts.length - 6} more</span>
                                ) : null}

                                <div className="ml-auto flex flex-wrap gap-2">
                                  {arts.map((u, i) => (
                                    <a
                                      key={`${String((l as any).id)}-art-${i}`}
                                      href={u}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center rounded-lg bg-white px-2 py-1 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
                                    >
                                      Open {i + 1}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{moneyFmt(lineTotal, currency)}</div>
                          <div className="text-xs text-gray-500">
                            {moneyFmt(unit, currency)} × {qty}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Tracking timeline */}
          <div className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">Tracking</h3>
              <a href="/contact" className="text-xs font-semibold text-indigo-700 hover:underline">
                Need help with delivery?
              </a>
            </div>

            <div className="mt-2">
              <ShipmentTimeline orderId={String(o.id)} />
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Status is synced via your backend per the <b>SinaLite API</b> documentation.
            </p>
          </div>
        </section>

        {/* Right: totals + addresses */}
        <aside className="space-y-6">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Summary</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{moneyFmt(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span>{moneyFmt(ship, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{moneyFmt(tax, currency)}</span>
              </div>
              {credits > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Loyalty credit</span>
                  <span>−{moneyFmt(credits, currency)}</span>
                </div>
              )}
              <hr className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{moneyFmt(total, currency)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Billing & Shipping</h3>

            <div className="mt-3 grid grid-cols-1 gap-4 text-sm text-gray-700">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Billing</div>
                <div className="mt-1">{(o as any).billingAddressId ? <span>On-file billing address</span> : <span>—</span>}</div>
                {(o as any).billingAddressId ? (
                  <form action={`/api/me/addresses/${String((o as any).billingAddressId)}/default`} method="post" className="mt-2">
                    <button
                      className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
                      formMethod="post"
                    >
                      Make default billing
                    </button>
                  </form>
                ) : null}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Shipping</div>
                <div className="mt-1">{(o as any).shippingAddressId ? <span>On-file shipping address</span> : <span>—</span>}</div>
                {(o as any).shippingAddressId ? (
                  <form action={`/api/me/addresses/${String((o as any).shippingAddressId)}/default`} method="post" className="mt-2">
                    <button
                      className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
                      formMethod="post"
                    >
                      Make default shipping
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
                <div className="font-semibold text-slate-900">Order ID</div>
                <div className="mt-1 font-mono break-all">{String(o.id)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">Need help?</h3>
            <p className="mt-2 text-sm text-gray-600">Questions about this order? We’re here to help.</p>

            <a
              href={`/support/new?orderId=${encodeURIComponent(String(o.id))}`}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50"
            >
              Contact support
            </a>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/account/orders"
                className="inline-flex flex-1 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                Back to orders
              </Link>

              <Link
                href="/contact"
                className="inline-flex flex-1 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                Contact page
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
