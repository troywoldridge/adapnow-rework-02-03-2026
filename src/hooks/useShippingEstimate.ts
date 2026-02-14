"use client";

import { useCallback, useRef, useState } from "react";

export type ShippingLine = {
  productId: number;
  optionIds: number[];
  quantity: number;
};

export type ShippingRate = {
  service: string;
  eta: string | null;
  cost: number; // dollars
  currency: "USD" | "CAD" | string;
};

type Input = {
  country: string;
  state: string;
  zip: string;
  store?: "US" | "CA";
  items: ShippingLine[];
};

type ApiOk = { ok: true; rates: any[] };
type ApiErr = { ok: false; error: string; detail?: unknown };
type ApiResp = ApiOk | ApiErr;

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normCountry(v: unknown): "US" | "CA" | string {
  const c = s(v).toUpperCase();
  if (c === "US" || c === "CA") return c;
  return c || "US";
}

function normStore(v: unknown): "US" | "CA" {
  const st = s(v).toUpperCase();
  return st === "CA" ? "CA" : "US";
}

function normalizeRates(raw: unknown, fallbackCurrency: "USD" | "CAD"): ShippingRate[] {
  if (!Array.isArray(raw)) return [];

  const out: ShippingRate[] = [];

  for (const r of raw as any[]) {
    const service = s(r?.service ?? r?.method ?? r?.serviceName ?? r?.serviceCode);
    const etaRaw = r?.eta ?? r?.estimatedDelivery ?? r?.delivery ?? null;

    // cost field names vary across older codepaths; accept both
    const cost = Math.max(0, toNumber(r?.cost ?? r?.amount ?? r?.price, 0));

    const currency = s(r?.currency).toUpperCase() || fallbackCurrency;

    out.push({
      service: service || "",
      eta: etaRaw == null ? null : s(etaRaw) || null,
      cost,
      currency,
    });
  }

  // Keep only useful rates
  return out.filter((r) => r.service || r.cost > 0);
}

async function readErrorMessage(res: Response): Promise<string> {
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

  return `Shipping estimate failed (${res.status} ${res.statusText})`;
}

function normalizeItems(items: ShippingLine[]): { productId: number; optionIds: number[]; quantity: number }[] {
  const src = Array.isArray(items) ? items : [];

  return src
    .map((l) => {
      const productId = Math.trunc(toNumber(l?.productId, 0));
      const optionIds = Array.isArray(l?.optionIds)
        ? (l.optionIds || []).map((x) => Math.trunc(toNumber(x, NaN))).filter((n) => Number.isFinite(n))
        : [];
      const quantity = Math.max(1, Math.trunc(toNumber(l?.quantity, 1)));

      return { productId, optionIds, quantity };
    })
    .filter((l) => l.productId > 0 && l.optionIds.length > 0 && l.quantity > 0);
}

export function useShippingEstimate() {
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const estimate = useCallback(async (input: Input): Promise<ShippingRate[]> => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    setLoading(true);
    setError(null);
    setRates([]);

    const country = normCountry(input.country);
    const store = normStore(input.store ?? (country === "CA" ? "CA" : "US"));
    const fallbackCurrency: "USD" | "CAD" = store === "CA" ? "CAD" : "USD";

    const body = {
      shipCountry: String(country),
      shipState: s(input.state).toUpperCase(),
      shipZip: s(input.zip),
      store,
      items: normalizeItems(input.items),
    };

    if (!body.items.length) {
      setError("No valid shippable items.");
      setLoading(false);
      return [];
    }

    try {
      const res = await fetch("/api/cart/estimate-shipping", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
        signal: ctl.signal,
        credentials: "include",
      });

      // Prefer JSON; fall back to a readable error.
      let json: ApiResp | null = null;
      try {
        json = (await res.json()) as ApiResp;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const msg = json && "ok" in json && json.ok === false ? json.error : await readErrorMessage(res);
        setError(msg);
        return [];
      }

      if (!json || !("ok" in json) || json.ok !== true) {
        const msg = (json as any)?.error || `Shipping estimate failed (${res.status} ${res.statusText})`;
        setError(String(msg));
        return [];
      }

      const normalized = normalizeRates(json.rates, fallbackCurrency);
      setRates(normalized);
      return normalized;
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : "Unknown error");
      if ((err as any)?.name !== "AbortError") {
        setError(err.message || "Shipping estimate failed");
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, rates, error, estimate };
}
