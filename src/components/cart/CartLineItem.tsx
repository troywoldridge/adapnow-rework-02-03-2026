"use client";

import { useEffect, useMemo } from "react";
import Image from "@/components/ImageSafe";

export type CartItem = {
  id: string;
  productId: number;
  name: string;
  optionIds: number[];
  quantity: number;
  cloudflareImageId: string | null;
  serverUnitPrice?: number;
};

type PriceResponse = { ok: true; unitPrice: number } | { ok: false; error?: string } | null;

function transparentGif(): string {
  return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
}

function cfPublicUrl(imageId: string | null): string {
  const acc = (process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH ?? "").trim();
  if (!imageId || !acc) return transparentGif();
  return `https://imagedelivery.net/${acc}/${imageId}/public`;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function money(n: number, currency: "USD" | "CAD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function CartLineItem({
  item,
  onQtyChange,
  onUnitPrice,
  onRemove,
  priority = false,
  currency = "USD",
}: {
  item: CartItem;
  onQtyChange: (id: string, qty: number) => void;
  onUnitPrice: (id: string, unit: number) => void;
  onRemove: (id: string) => void;
  priority?: boolean;
  currency?: "USD" | "CAD";
}) {
  const optionKey = useMemo(() => (item.optionIds ?? []).join(","), [item.optionIds]);

  // Fetch live price (SinaLite pricing API) whenever options/qty change.
  // NOTE: If your API also needs `store`, add it to the POST body + dependencies.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/sinalite/price/${item.productId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ optionIds: item.optionIds, quantity: item.quantity }),
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as PriceResponse;
        if (!data || !("ok" in data) || !data.ok) return;

        const unit = Number((data as any).unitPrice ?? 0);
        if (!Number.isFinite(unit)) return;

        onUnitPrice(item.id, unit);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        // don’t spam logs for transient pricing failures
      }
    })();

    return () => controller.abort();
  }, [item.id, item.productId, item.quantity, optionKey, onUnitPrice, item.optionIds]);

  const unitDisplay = money(Number(item.serverUnitPrice ?? 0), currency);

  return (
    <div className="cart-line">
      <div className="cart-line__media">
        <Image
          src={cfPublicUrl(item.cloudflareImageId)}
          alt={item.name}
          fill
          sizes="120px"
          className="cart-line__img"
          priority={priority}
          draggable={false}
        />
      </div>

      <div className="cart-line__main">
        <div className="cart-line__titleRow">
          <strong className="cart-line__title">{item.name}</strong>
        </div>

        <div className="cart-line__qtyRow">
          <label htmlFor={`qty-${item.id}`} className="cart-line__qtyLabel">
            Qty
          </label>
          <input
            id={`qty-${item.id}`}
            className="cart-line__qtyInput"
            type="number"
            min={1}
            max={9999}
            value={item.quantity}
            onChange={(e) => {
              const next = clampInt(Number(e.target.value || 1), 1, 9999);
              onQtyChange(item.id, next);
            }}
            inputMode="numeric"
            aria-label={`Quantity for ${item.name}`}
          />
        </div>
      </div>

      <div className="cart-line__right">
        <div className="cart-line__unitPrice">{unitDisplay}</div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.name}`}
          className="cart-line__removeBtn"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
