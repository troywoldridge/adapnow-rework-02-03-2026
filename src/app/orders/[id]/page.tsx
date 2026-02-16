import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import ReorderButton from "@/components/orders/ReorderButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = { ok: true; order: any; items?: any[] };
type ApiErr = { ok: false; error: string };

type Currency = "USD" | "CAD";

function safeString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function toCurrency(v: unknown): Currency {
  const s = safeString(v).toUpperCase();
  return s === "CAD" ? "CAD" : "USD";
}

/**
 * Parse cents from mixed payloads:
 * - if number is an integer and >= 100, treat as cents
 * - if number is decimal-ish, treat as dollars and convert to cents
 * - if string, strip symbols and parse similarly
 */
function parseCentsFromUnknown(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v) && Math.abs(v) >= 100) return Math.trunc(v);
    return Math.round(v * 100);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const cleaned = s.replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    if (Number.isInteger(n) && Math.abs(n) >= 100) return Math.trunc(n);
    return Math.round(n * 100);
  }
  return null;
}

function moneyFromCents(cents: number, currency: Currency) {
  const dollars = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(dollars);
  } catch {
    return `$${dollars.toFixed(2)}`;
  }
}

function formatDateTime(v: unknown): string {
  if (!v) return "—";
  try {
    const s = safeString(v);
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toLocaleString();
    if (/^\d{13}$/.test(s)) return new Date(Number(s)).toLocaleString();
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  } catch {}
  return safeString(v) || "—";
}

async function baseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function getOrder(id: string) {
  const url = `${await baseUrl()}/api/orders/${encodeURIComponent(id)}`;
  const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });

  let json: ApiOk | ApiErr | null = null;
  try {
    json = (await res.json()) as ApiOk | ApiErr;
  } catch {}

  if (!res.ok || !json || !("ok" in json) || !json.ok) return null;

  return {
    order: json.order,
    items: Array.isArray(json.items) ? json.items : [],
  };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const data = await getOrder(id);
  if (!data) return notFound();

  const { order, items } = data;

  const orderId = safeString(order?.id) || id;
  const status = safeString(order?.status) || "Unknown";

  const currency = toCurrency(
    order?.currency ?? order?.Currency ?? order?.order_currency ?? order?.storeCurrency
  );

  const totalCents =
    parseCentsFromUnknown(order?.total_cents) ??
    parseCentsFromUnknown(order?.totalCents) ??
    parseCentsFromUnknown(order?.amount_total) ??
    parseCentsFromUnknown(order?.amountTotal) ??
    parseCentsFromUnknown(order?.total) ??
    null;

  const created = formatDateTime(
    order?.created_time ?? order?.createdAt ?? order?.created_at ?? order?.created
  );

  const shipMethod =
    safeString(order?.ShipMethod) ||
    safeString(order?.shipping_method) ||
    safeString(order?.shippingMethod) ||
    "—";

  const email =
    safeString(order?.ShipEmail) ||
    safeString(order?.email) ||
    safeString(order?.customerEmail) ||
    "—";

  const invoiceHref = `/orders/${encodeURIComponent(orderId)}/invoice`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Order #{orderId}</h1>
          <p className="text-sm text-gray-600">
            Status: <span className="font-medium">{status}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/account/orders"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Back to orders
          </Link>

          <ReorderButton orderId={orderId} />

          <a
            href={invoiceHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
          >
            View invoice (PDF)
          </a>
        </div>
      </header>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Summary</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Total</dt>
            <dd className="font-medium">
              {totalCents != null
                ? moneyFromCents(totalCents, currency)
                : safeString(order?.total ?? order?.amount_total) || "—"}
            </dd>
          </div>

          <div>
            <dt className="text-gray-500">Created</dt>
            <dd className="font-medium">{created}</dd>
          </div>

          <div>
            <dt className="text-gray-500">Shipping Method</dt>
            <dd className="font-medium">{shipMethod}</dd>
          </div>

          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium break-all">{email}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Items</h2>

        {items.length === 0 ? (
          <p className="text-sm text-gray-600">No line items.</p>
        ) : (
          <ul className="divide-y">
            {items.map((it: any, i: number) => {
              const pid = safeString(it?.product_id ?? it?.productId) || "—";
              const qty = Number.isFinite(Number(it?.quantity ?? it?.qty))
                ? Number(it?.quantity ?? it?.qty)
                : 1;

              const lineCents =
                parseCentsFromUnknown(it?.line_total_cents) ??
                parseCentsFromUnknown(it?.lineTotalCents) ??
                parseCentsFromUnknown(it?.total) ??
                parseCentsFromUnknown(it?.amount_total) ??
                parseCentsFromUnknown(it?.price) ??
                null;

              const label =
                safeString(it?.name ?? it?.title ?? it?.product_name) || `Product #${pid}`;

              return (
                <li key={safeString(it?.id) || `${pid}-${i}`} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{label}</div>
                      <div className="text-gray-600">
                        Product ID: <span className="font-mono">{pid}</span> &middot; Qty:{" "}
                        <span className="font-mono">{qty}</span>
                      </div>
                    </div>

                    <div className="shrink-0 font-semibold">
                      {lineCents != null
                        ? moneyFromCents(lineCents, currency)
                        : safeString(it?.total ?? it?.price ?? it?.amount_total) || "—"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
