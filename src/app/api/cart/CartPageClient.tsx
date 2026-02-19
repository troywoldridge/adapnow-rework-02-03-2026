"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CartSummary from "@/components/CartSummary";
import type { ShippingRate } from "@/components/cart/CartShippingEstimator";

/* =========================================================
   Types
   ========================================================= */
type AnyItem = {
  id: string;
  productId: number;
  name?: string | null;
  optionIds: number[];
  quantity: number;
  cloudflareImageId?: string | null;
  serverUnitPrice?: number; // dollars from server
  unitPrice?: number; // client override (dollars)
};

type SavedItem = {
  id: string;
  productId: number;
  name?: string | null;
  optionIds: number[];
  quantity: number;
  cloudflareImageId?: string | null;
  unitPrice?: number;
};

type Props = {
  initialItems: AnyItem[];
  currency: "USD" | "CAD";
  store: "US" | "CA";
  initialShipping: ShippingRate | null;
};

type Attachment = {
  id: string;
  fileName: string;
  url?: string | null;
  cfImageId?: string | null;
};

type ApiCurrent = {
  cart: { id: string; sid: string; status: string; currency?: "USD" | "CAD" } | null;
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
  attachments: Record<
    string,
    Array<{
      id: string;
      fileName: string;
      url?: string | null;
      key?: string | null;
      cfImageId?: string | null;
    }>
  >;
  selectedShipping?: unknown;
};

const SAVED_KEY = "ADAP_SAVED_V1";

/* =========================================================
   Helpers
   ========================================================= */
const money = (n: number, currency: "USD" | "CAD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(n) || 0);

/**
 * Build a Cloudflare Image Delivery URL.
 *
 * SECURITY: Do NOT hardcode an account hash fallback in client code.
 * If NEXT_PUBLIC_CF_ACCOUNT_HASH is missing, return null so UI can use a placeholder.
 */
function cfImgUrl(id?: string | null, variant: string = "public") {
  if (!id) return null;
  const acct = process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH;
  if (!acct) return null;
  return `https://imagedelivery.net/${acct}/${id}/${variant}`;
}

function safeUUID(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {}
  return `saved_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function asMoneyNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/**
 * Normalize ANY incoming "shipping-like" object into ShippingRate.
 *
 * IMPORTANT: Based on your TS compiler errors, ShippingRate does NOT include:
 * - code
 * - name
 * - etaDays
 *
 * It DOES include:
 * - carrier
 * - serviceCode
 * - serviceName
 * - amount
 * - currency
 */
function toShippingRate(v: unknown, fallbackCurrency: "USD" | "CAD"): ShippingRate | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;

  const carrier = asString(r.carrier).trim();
  const serviceCode = asString(r.serviceCode ?? r.method).trim();
  const serviceName = asString(r.serviceName ?? r.methodName ?? r.method ?? r.serviceCode).trim();

  const amount =
    typeof r.amount === "number"
      ? r.amount
      : typeof r.cost === "number"
      ? r.cost
      : asMoneyNumber(r.amount ?? r.cost ?? 0);

  const currency: "USD" | "CAD" = r.currency === "CAD" ? "CAD" : fallbackCurrency;

  if (!carrier || !serviceCode || !serviceName) return null;

  // Return ONLY known properties for ShippingRate (no extra keys).
  return {
    carrier,
    serviceCode,
    serviceName,
    amount,
    currency,
  };
}

/** Prefer artwork thumb if present, else product image. */
function pickLineThumb(
  it: AnyItem,
  attMap: Record<string, Attachment[]>,
): { src: string | null; alt: string } {
  const list = attMap[it.id];
  if (list && list.length > 0) {
    const a = list[0];
    const artSrc = a.cfImageId ? cfImgUrl(a.cfImageId, "productCard") : a.url ?? null;
    if (artSrc) return { src: artSrc, alt: a.fileName || it.name || `Product ${it.productId}` };
  }

  const prodSrc =
    cfImgUrl(it.cloudflareImageId, "productCard") || cfImgUrl(it.cloudflareImageId, "public");

  return { src: prodSrc, alt: it.name || `Product ${it.productId}` };
}

function clampQty(n: number) {
  return Math.max(1, Math.min(9999, Math.floor(n)));
}

/* =========================================================
   Component
   ========================================================= */
export default function CartPageClient({ initialItems, currency, store, initialShipping }: Props) {
  const [items, setItems] = useState<AnyItem[]>(initialItems || []);
  const [selectedShipping, setSelectedShipping] = useState<ShippingRate | null>(initialShipping);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [attachmentsByLine, setAttachmentsByLine] = useState<Record<string, Attachment[]>>({});
  const [uiError, setUiError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw) as SavedItem[]);
    } catch {}
  }, []);

  function persistSaved(next: SavedItem[]) {
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {}
  }

  const subtotal = useMemo(
    () =>
      (items || []).reduce((sum, it) => {
        const unit =
          typeof it.serverUnitPrice === "number"
            ? it.serverUnitPrice
            : typeof it.unitPrice === "number"
            ? it.unitPrice
            : 0;
        return sum + unit * (it.quantity || 1);
      }, 0),
    [items],
  );

  // feed estimator/summary
  const miniLines = useMemo(
    () =>
      (items || []).map((it) => ({
        productId: it.productId,
        optionIds: it.optionIds || [],
        qty: it.quantity || 1,
      })),
    [items],
  );

  async function refreshFromServer() {
    try {
      const res = await fetch("/api/cart/current", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as ApiCurrent;

        const mapped: AnyItem[] = (json.lines || []).map((ln) => ({
          id: String(ln.id),
          productId: Number(ln.productId),
          name: ln.productName ?? null,
          optionIds: [],
          quantity: Number(ln.quantity || 1),
          cloudflareImageId: ln.productCfImageId ?? null,
          serverUnitPrice: typeof ln.unitPriceCents === "number" ? ln.unitPriceCents / 100 : undefined,
        }));

        setItems(mapped);

        const att: Record<string, Attachment[]> = {};
        for (const [lineId, list] of Object.entries(json.attachments || {})) {
          att[lineId] = (list || []).map((a) => ({
            id: String(a.id),
            fileName: a.fileName ?? "Artwork",
            url: a.url ?? undefined,
            cfImageId: a.cfImageId ?? undefined,
          }));
        }
        setAttachmentsByLine(att);

        const normalized = toShippingRate(json.selectedShipping, currency);
        setSelectedShipping(normalized);
        return;
      }

      // fallback legacy
      const res2 = await fetch("/api/cart", { cache: "no-store" });
      if (res2.ok) {
        const j2 = (await res2.json()) as any;

        const itemsShape: AnyItem[] = (j2?.items ?? j2?.cart?.items ?? []) as AnyItem[];
        setItems(
          itemsShape.map((it) => ({
            ...it,
            serverUnitPrice: typeof it.unitPrice === "number" ? it.unitPrice : it.serverUnitPrice,
          })),
        );

        const legacyShip = j2?.selectedShipping ?? j2?.cart?.selectedShipping ?? j2?.cart?.shipping ?? null;
        setSelectedShipping(toShippingRate(legacyShip, currency));
      }
    } catch (e) {
      console.error("refreshFromServer error", e);
    }
  }

  useEffect(() => {
    void refreshFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeLine(lineId: string) {
    setUiError(null);
    setBusyId(lineId);
    try {
      const res = await fetch(`/api/cart/lines/${encodeURIComponent(lineId)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) {
        setUiError("Couldn’t remove that item. Please try again.");
        return;
      }
      await refreshFromServer();
    } finally {
      setBusyId(null);
    }
  }

  async function updateQty(lineId: string, qty: number) {
    if (!Number.isFinite(qty)) return;

    const nextQty = clampQty(qty);
    setUiError(null);
    setBusyId(lineId);
    try {
      const res = await fetch(`/api/cart/lines/${encodeURIComponent(lineId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity: nextQty }),
        cache: "no-store",
      });

      if (!res.ok) {
        setUiError("Couldn’t update quantity. Please try again.");
        return;
      }

      await refreshFromServer();
    } finally {
      setBusyId(null);
    }
  }

  async function saveForLater(line: AnyItem) {
    setUiError(null);
    setBusyId(line.id);
    try {
      const snapshotUnit =
        typeof line.serverUnitPrice === "number"
          ? line.serverUnitPrice
          : typeof line.unitPrice === "number"
          ? line.unitPrice
          : undefined;

      const next: SavedItem = {
        id: safeUUID(),
        productId: line.productId,
        name: line.name,
        optionIds: Array.isArray(line.optionIds) ? line.optionIds : [],
        quantity: Number(line.quantity || 1),
        cloudflareImageId: line.cloudflareImageId ?? null,
        unitPrice: snapshotUnit,
      };

      // optimistic save
      persistSaved([next, ...saved]);

      const res = await fetch(`/api/cart/lines/${encodeURIComponent(line.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });

      if (!res.ok) {
        // rollback if delete fails
        persistSaved(saved);
        setUiError("Couldn’t save for later. Please try again.");
        return;
      }

      await refreshFromServer();
    } finally {
      setBusyId(null);
    }
  }

  async function moveToCart(si: SavedItem) {
    setUiError(null);
    try {
      const res = await fetch("/api/cart/lines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: si.productId,
          optionIds: si.optionIds,
          quantity: si.quantity,
        }),
        cache: "no-store",
      });

      // ✅ Only treat as success if res.ok
      if (!res.ok) {
        setUiError("Couldn’t move that item to your cart. Please try again.");
        return;
      }

      persistSaved(saved.filter((x) => x.id !== si.id));
      await refreshFromServer();
    } catch (e) {
      console.error("moveToCart error", e);
      setUiError("Couldn’t move that item to your cart. Please try again.");
    }
  }

  function removeSaved(si: SavedItem) {
    persistSaved(saved.filter((x) => x.id !== si.id));
  }

  async function onChangeShipping(rate: ShippingRate | null) {
    setSelectedShipping(rate);
    setUiError(null);

    try {
      const res = await fetch("/api/cart/shipping/choose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rate ?? {}),
        cache: "no-store",
      });

      if (!res.ok) {
        setUiError("Couldn’t select shipping. Please try again.");
        return;
      }

      await refreshFromServer();
    } catch (e) {
      console.error("onChangeShipping error", e);
      setUiError("Couldn’t select shipping. Please try again.");
    }
  }

  return (
    <main className="cart2" aria-labelledby="cart-heading">
      <h1 className="sr-only" id="cart-heading">
        Your Cart
      </h1>

      {uiError && (
        <div className="card mt-3" role="alert" aria-live="polite">
          <strong>Heads up:</strong> {uiError}
        </div>
      )}

      <div className="cart2__grid">
        <section aria-label="Cart items" className="cart2__left">
          {items.length === 0 ? (
            <div className="card text-center">
              <h2 className="m-0">Your cart is empty</h2>
              <p className="muted mt-1">Let’s fix that. Find something awesome to print!</p>
              <Link href="/" className="btn primary mt-3">
                Continue shopping
              </Link>
            </div>
          ) : (
            <ul className="cart2__list" aria-label="Items in your cart">
              {items.map((it) => {
                const unit =
                  typeof it.serverUnitPrice === "number"
                    ? it.serverUnitPrice
                    : typeof it.unitPrice === "number"
                    ? it.unitPrice
                    : 0;

                const lineTotal = unit * (it.quantity || 1);
                const thumb = pickLineThumb(it, attachmentsByLine);
                const displayName = it.name || `Product ${it.productId}`;

                return (
                  <li key={it.id} className="cart2__row card">
                    <div className="cart2__rowGrid">
                      <div className="cart2__thumb" aria-hidden="true">
                        {thumb.src ? (
                          <img
                            className="cart2__thumbImg"
                            src={thumb.src}
                            alt={thumb.alt}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="cart2__thumbImg" />
                        )}
                      </div>

                      <div className="minw0">
                        <div className="cart2__name">{displayName}</div>
                        <div className="cart2__each">
                          {unit ? `${money(unit, currency)} each` : `${money(0, currency)} each`}
                        </div>

                        <div className="cart2__qtyWrap">
                          <label htmlFor={`qty-${it.id}`}>Qty</label>
                          <input
                            id={`qty-${it.id}`}
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={it.quantity}
                            disabled={busyId === it.id}
                            onChange={(e) => {
                              const val = Number(e.currentTarget.value);
                              if (Number.isNaN(val) || !Number.isFinite(val)) return;
                              void updateQty(it.id, val);
                            }}
                            className="cart2__qtyInput"
                            aria-label={`Quantity for ${displayName}`}
                          />
                        </div>

                        <button
                          onClick={() => void saveForLater(it)}
                          disabled={busyId === it.id}
                          className="link-btn"
                          aria-label={`Save ${displayName} for later`}
                        >
                          Save for later
                        </button>
                      </div>

                      <div className="cart2__rowRight">
                        <div className="cart2__lineTotal">{money(lineTotal, currency)}</div>
                        <button
                          onClick={() => void removeLine(it.id)}
                          disabled={busyId === it.id}
                          className="link-dim"
                          aria-label={`Remove ${displayName}`}
                        >
                          {busyId === it.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {saved.length > 0 && (
            <div className="card mt-6" aria-label="Saved for later">
              <h2 className="m-0">Saved for later</h2>
              <ul className="cart2__list mt-3" aria-label="Saved items">
                {saved.map((si) => {
                  const img =
                    cfImgUrl(si.cloudflareImageId, "productCard") ||
                    cfImgUrl(si.cloudflareImageId, "public");

                  return (
                    <li key={si.id} className="cart2__savedRow">
                      <div className="cart2__rowGrid">
                        <div className="cart2__thumb" aria-hidden="true">
                          {img ? (
                            <img
                              className="cart2__thumbImg"
                              src={img}
                              alt={si.name ?? `Product ${si.productId}`}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="cart2__thumbImg" />
                          )}
                        </div>

                        <div className="minw0">
                          <div className="cart2__name">{si.name || `Product ${si.productId}`}</div>
                          <div className="cart2__each">
                            {typeof si.unitPrice === "number"
                              ? `${money(si.unitPrice, currency)} each`
                              : "Price shown at checkout"}
                          </div>
                          <div className="muted mt-1">Qty: {si.quantity}</div>
                        </div>

                        <div className="cart2__savedActions">
                          <button className="btn primary" onClick={() => void moveToCart(si)}>
                            Move to cart
                          </button>
                          <button className="link-dim" onClick={() => removeSaved(si)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <aside className="cart2__right" aria-label="Order summary">
          <div className="card">
            <CartSummary
              currency={currency}
              subtotal={subtotal}
              lines={miniLines}
              store={store}
              selectedShipping={selectedShipping}
              onChangeShipping={onChangeShipping}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
