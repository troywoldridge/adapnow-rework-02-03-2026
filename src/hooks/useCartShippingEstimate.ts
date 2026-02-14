"use client";

import { useCallback, useRef, useState } from "react";

export type CartLine = {
  productId: number;
  optionIds: number[];
  quantity: number;
};

export type ShippingRate = {
  carrier: string;
  method: string;
  cost: number; // dollars
  days: number | null;
  currency: "USD" | "CAD";
};

type EstimateArgs = {
  country: "US" | "CA";
  state: string;
  zip: string;
  store?: "US" | "CA";
  items: CartLine[];
};

type ApiOk = { ok: true; rates: ShippingRate[] };
type ApiErr = { ok: false; error: string; detail?: unknown };
type ApiResp = ApiOk | ApiErr;

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStr(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function normalizeCurrency(v: unknown, fallback: "USD" | "CAD"): "USD" | "CAD" {
  const s = toStr(v).toUpperCase();
  return s === "CAD" ? "CAD" : s === "USD" ? "USD" : fallback;
}

function normalizeRates(rates: unknown, fallbackCurrency: "USD" | "CAD"): ShippingRate[] {
  if (!Array.isArray(rates)) return [];

  const out: ShippingRate[] = [];

  for (const r of rates as any[]) {
    out.push({
      carrier: toStr(r?.carrier, ""),
      method: toStr(r?.method ?? r?.service ?? r?.serviceName, ""),
      cost: Math.max(0, toNumber(r?.cost ?? r?.amount, 0)),
      days: Number.isFinite(Number(r?.days)) ? Math.trunc(Number(r?.days)) : null,
      currency: normalizeCurrency(r?.currency, fallbackCurrency),
    });
  }

  return out.filter((x) => x.carrier || x.method || x.cost > 0);
}

async function readApiError(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const j = (await res.json()) as any;
      const msg = typeof j?.error === "string" ? j.error : typeof j?.message === "string" ? j.message : "";
      if (msg) return msg;
    } catch {
      // ignore
    }
  }

  try {
    const t = (await res.text()).trim();
    if (t) return t.slice(0, 500);
  } catch {
    // ignore
  }

  return `Failed to fetch rates (${res.status})`;
}

export function useCartShippingEstimate() {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false); // first call
  const [refreshing, setRefreshing] = useState(false); // subsequent calls
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hasRunRef = useRef(false);

  const estimate = useCallback(async (args: EstimateArgs): Promise<ShippingRate[]> => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    const isFirst = !hasRunRef.current;

    // Keep your original behavior: clear rates on each estimate.
    // If you ever want SWR-style UI (keep old rates visible), remove this line.
    setRates([]);
    setError(null);

    try {
      if (isFirst) setLoading(true);
      else setRefreshing(true);

      const country = args.country;
      const store = args.store || country;

      const res = await fetch("/api/cart/estimate-shipping", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          shipCountry: country,
          shipState: args.state,
          shipZip: args.zip,
          items: args.items,
          store,
        }),
        cache: "no-store",
        signal: ctl.signal,
        credentials: "include",
      });

      // Try json first; if that fails, fall back to text error.
      let json: ApiResp | null = null;
      try {
        json = (await res.json()) as ApiResp;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const msg = json && "ok" in json && json.ok === false ? json.error : await readApiError(res);
        throw new Error(msg);
      }

      if (!json || !("ok" in json) || json.ok !== true) {
        const msg = (json as any)?.error || "Failed to fetch rates";
        throw new Error(String(msg));
      }

      const fallbackCurrency: "USD" | "CAD" = store === "CA" ? "CAD" : "USD";
      const normalized = normalizeRates(json.rates, fallbackCurrency);

      setRates(normalized);
      hasRunRef.current = true;
      return normalized;
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
      if ((e as any)?.name !== "AbortError") {
        setError(toStr(e.message, "Failed to fetch rates"));
      }
      return [];
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  return { rates, loading, refreshing, error, estimate };
}
