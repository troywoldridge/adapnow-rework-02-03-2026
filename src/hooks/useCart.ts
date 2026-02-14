"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Minimal shape for a cart line we can render in a badge, totals, etc. */
export type CartItem = {
  id: string;
  productId?: number;
  name?: string;
  quantity: number;
  unitPrice?: number; // cents or dollars — not used by badge, but handy
  imageUrl?: string | null;
};

/** Internal: a simple event bus so any part of the app can say “cart changed” */
const bus: EventTarget =
  (globalThis as any).__ADAP_CART_BUS__ ?? ((globalThis as any).__ADAP_CART_BUS__ = new EventTarget());

export function emitCartChanged() {
  bus.dispatchEvent(new Event("cart:changed"));
}

function safeIdFallback(): string {
  try {
    const c = (globalThis as any).crypto as Crypto | undefined;
    if (c && "randomUUID" in c && typeof (c as any).randomUUID === "function") {
      return (c as any).randomUUID();
    }
  } catch {
    // ignore
  }
  return `tmp_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function toNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStr(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function toNullableStr(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function getCfThumbFromId(cfId: unknown): string | null {
  const id = toNullableStr(cfId);
  if (!id) return null;

  // NOTE: In client bundles, NEXT_PUBLIC_* envs are baked at build-time.
  // If it's not present, we can't reliably build a CF URL here.
  const acct = (process.env.NEXT_PUBLIC_CF_ACCOUNT_HASH ?? "").trim();
  if (!acct) return null;

  return `https://imagedelivery.net/${acct}/${id}/thumbnail`;
}

/** Try to normalize whatever your /api/cart returns into CartItem[] */
function normalizeToItems(payload: unknown): CartItem[] {
  const p = payload as any;

  // Common shapes:
  // 1) { ok: true, cart: {...}, lines: [...] }
  // 2) { cart: { lines: [...] } }
  // 3) { lines: [...] }
  const lines =
    p?.lines ??
    p?.cart?.lines ??
    p?.cartLines ??
    p?.data?.lines ??
    [];

  if (!Array.isArray(lines)) return [];

  const out: CartItem[] = [];

  for (const l of lines) {
    const qty = toNum(l?.quantity ?? l?.qty, 0);
    if (!(qty > 0)) continue;

    const id = toStr(l?.id ?? l?.lineId, "");
    const productIdNum = toNum(l?.productId ?? l?.product_id, NaN);
    const productId = Number.isFinite(productIdNum) ? productIdNum : undefined;

    const name = toStr(l?.name ?? l?.productName ?? l?.displayName, "");

    // unitPrice can be cents or dollars depending on endpoint; consumers should know what they expect
    const unitPrice = toNum(l?.unitPrice ?? l?.price ?? l?.unit_price, 0);

    const imageUrl =
      toNullableStr(l?.imageUrl ?? l?.thumbUrl ?? l?.image) ??
      getCfThumbFromId(l?.cloudflare_image_id) ??
      null;

    out.push({
      id: id || safeIdFallback(),
      productId,
      name: name || undefined,
      quantity: qty,
      unitPrice,
      imageUrl,
    });
  }

  return out;
}

async function fetchCartOnce(signal?: AbortSignal): Promise<CartItem[]> {
  // Prefer a single canonical endpoint.
  const res = await fetch("/api/cart", {
    method: "GET",
    signal,
    credentials: "include",
    cache: "no-store",
    headers: {
      "accept": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Cart fetch failed: ${res.status}`);
  }

  const json = (await res.json().catch(() => null)) as unknown;
  return normalizeToItems(json);
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(typeof e === "string" ? e : "Unknown error");
}

export function useCart(pollMs: number = 0) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true); // first load only
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setErr] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didInitRef = useRef(false);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    const isFirst = !didInitRef.current;

    try {
      if (isFirst) setIsLoading(true);
      else setIsRefreshing(true);

      setErr(null);

      const next = await fetchCartOnce(ctl.signal);
      setItems(next);
      didInitRef.current = true;
    } catch (e: unknown) {
      const err = toError(e);
      // Ignore abort errors
      if ((err as any)?.name !== "AbortError") setErr(err);
    } finally {
      if (isFirst) setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // initial load
    refresh();

    // revalidate when any part of app emits cart:changed
    const onChanged = () => refresh();
    bus.addEventListener("cart:changed", onChanged);

    // optional polling
    if (pollMs > 0) {
      pollRef.current = setInterval(refresh, pollMs);
    }

    return () => {
      bus.removeEventListener("cart:changed", onChanged);
      abortRef.current?.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh, pollMs]);

  const itemCount = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.quantity || 0), 0);
  }, [items]);

  return { items, itemCount, isLoading, isRefreshing, error, refresh };
}
