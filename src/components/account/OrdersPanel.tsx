"use client";

import * as React from "react";
import Link from "next/link";
import Image from "@/components/ImageSafe";

import { cfImage } from "@/lib/cfImages";
import productAssetsRaw from "@/data/productAssets.json";

type ProductAsset = {
  id?: number | string | null;
  name?: string | null;

  // various historical keys we’ve seen in assets
  cf_image_id?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;
  cloudflare_id?: string | null;
  cloudflare_image_id?: string | null;

  [k: string]: unknown;
};

export type OrderDTO = {
  id: string;
  orderNumber: string | null;
  placedAt: string | null;
  status: string | null;
  paymentStatus: string | null;
  provider: string | null;
  providerId: string | null;
  currency: "USD" | "CAD" | string | null;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  creditsCents: number;
  totalCents: number;
  representativeProductId: number | null;
};

type OrdersApiResponse =
  | { ok: true; orders: OrderDTO[] }
  | { ok: false; error?: string };

const CARD_VARIANT = "productThumb" as const;
const CF_PLACEHOLDER_ID = "a90ba357-76ea-48ed-1c65-44fff4401600";

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function pickFirstCfId(p?: ProductAsset | null): string | null {
  if (!p) return null;

  const candidates = [
    p.cf_image_1_id,
    p.cf_image_2_id,
    p.cf_image_3_id,
    p.cf_image_4_id,
    p.cf_image_id,
    p.cloudflare_image_id,
    p.cloudflare_id,
  ]
    .map((x) => s(x))
    .filter(Boolean);

  return candidates[0] ?? null;
}

function isHttpUrl(v: string): boolean {
  const x = v.toLowerCase();
  return x.startsWith("http://") || x.startsWith("https://");
}

function normalizeCurrency(code: string | null | undefined): "USD" | "CAD" {
  return code === "CAD" ? "CAD" : "USD";
}

function formatMoney(cents: number, currency: "USD" | "CAD"): string {
  // supports negatives (credits, discounts)
  const amount = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function safeLabel(v: string | null | undefined, fallback: string): string {
  const x = s(v);
  return x || fallback;
}

function statusTone(statusRaw: string | null | undefined): "good" | "bad" | "neutral" {
  const status = s(statusRaw).toLowerCase();

  if (status === "fulfilled" || status === "completed" || status === "shipped" || status === "delivered") {
    return "good";
  }
  if (status === "cancelled" || status === "canceled" || status === "failed" || status === "refunded") {
    return "bad";
  }
  return "neutral";
}

function summarizeOrderTitle(o: OrderDTO): string {
  if (o.orderNumber) return `Order #${o.orderNumber}`;
  const id = s(o.id);
  return id ? `Order ${id.slice(0, 8)}` : "Order";
}

async function readJsonSafe(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text().catch(() => "");
  return { ok: false, error: text || `HTTP ${res.status}` };
}

function buildAssetIndex(raw: unknown): Map<number, ProductAsset> {
  const map = new Map<number, ProductAsset>();
  const arr = Array.isArray(raw) ? (raw as ProductAsset[]) : [];

  for (const row of arr) {
    const id = toInt(row?.id);
    if (id == null) continue;
    if (map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}

function imageForProduct(assetIndex: Map<number, ProductAsset>, productId?: number | null): string {
  const pid = toInt(productId);
  const row = pid != null ? assetIndex.get(pid) : undefined;

  const ref = pickFirstCfId(row) ?? CF_PLACEHOLDER_ID;
  if (!ref) return "/placeholder.svg";
  if (isHttpUrl(ref)) return ref;

  return cfImage(ref, CARD_VARIANT) || cfImage(ref, "public") || "/placeholder.svg";
}

export default function OrdersPanel() {
  const [loading, setLoading] = React.useState(true);
  const [orders, setOrders] = React.useState<OrderDTO[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  // Build the asset lookup once (client-side) and reuse
  const assetIndex = React.useMemo(() => buildAssetIndex(productAssetsRaw), []);

  React.useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch("/api/me/orders", {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
          headers: { accept: "application/json" },
        });

        const data = (await readJsonSafe(res)) as OrdersApiResponse;

        if (!res.ok || !data?.ok) {
          throw new Error((data as any)?.error || `Failed to load orders (HTTP ${res.status})`);
        }

        const list = Array.isArray((data as any).orders) ? ((data as any).orders as OrderDTO[]) : [];
        setOrders(list);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setErr(e?.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    })();

    return () => ac.abort();
  }, []);

  if (loading) {
    return (
      <div className="orders-panel orders-panel--card" aria-busy="true">
        <div className="orders-panel__loading">Loading orders…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="orders-panel orders-panel--card">
        <div className="orders-panel__error" role="status">
          {err}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="orders-panel orders-panel--card orders-panel--empty">
        <div className="orders-panel__emptyTitle">No orders yet.</div>
        <div className="orders-panel__emptySub">
          Once you place an order, it will appear here automatically.
        </div>

        <div className="orders-panel__emptyActions">
          <Link href="/products" className="btn btn-primary btn-sm">
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="orders-list" aria-label="Orders">
      {orders.map((o) => {
        const currency = normalizeCurrency(o.currency);
        const img = imageForProduct(assetIndex, o.representativeProductId);
        const statusText = safeLabel(o.status, "Placed");
        const tone = statusTone(o.status);
        const title = summarizeOrderTitle(o);
        const placed = formatDate(o.placedAt);

        return (
          <li key={o.id} className="order-card">
            <div className="order-card__row">
              <div className="order-card__media">
                <Image
                  src={img}
                  alt={title}
                  width={80}
                  height={80}
                  className="order-card__img"
                />
              </div>

              <div className="order-card__main">
                <div className="order-card__badges">
                  <span className={`badge badge--${tone}`} aria-label={`Status: ${statusText}`}>
                    {statusText}
                  </span>

                  {o.paymentStatus ? (
                    <span className="badge badge--soft">{o.paymentStatus}</span>
                  ) : null}

                  {o.provider ? (
                    <span className="badge badge--soft">{o.provider}</span>
                  ) : null}
                </div>

                <div className="order-card__titleRow">
                  <div className="order-card__title" title={title}>
                    {title}
                  </div>
                  {placed ? <div className="order-card__date">Placed {placed}</div> : null}
                </div>

                <div className="order-card__amounts">
                  <div className="order-card__amountGrid">
                    <div className="order-card__amountItem">
                      <span className="order-card__amountLabel">Subtotal</span>
                      <span className="order-card__amountValue">
                        {formatMoney(o.subtotalCents, currency)}
                      </span>
                    </div>

                    <div className="order-card__amountItem">
                      <span className="order-card__amountLabel">Shipping</span>
                      <span className="order-card__amountValue">
                        {formatMoney(o.shippingCents, currency)}
                      </span>
                    </div>

                    <div className="order-card__amountItem">
                      <span className="order-card__amountLabel">Tax</span>
                      <span className="order-card__amountValue">{formatMoney(o.taxCents, currency)}</span>
                    </div>

                    {o.creditsCents > 0 ? (
                      <div className="order-card__amountItem order-card__amountItem--credit">
                        <span className="order-card__amountLabel">Loyalty credit</span>
                        <span className="order-card__amountValue">
                          −{formatMoney(o.creditsCents, currency)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="order-card__total">
                    <span className="order-card__totalLabel">Total</span>
                    <span className="order-card__totalValue">{formatMoney(o.totalCents, currency)}</span>
                  </div>
                </div>

                <div className="order-card__note">
                  Tracking will appear here once available via the SinaLite API.
                </div>
              </div>

              <div className="order-card__actions">
                <Link href={`/account/orders/${o.id}`} className="btn btn-secondary btn-sm">
                  View order
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
