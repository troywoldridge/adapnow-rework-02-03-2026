"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Store = "US" | "CA";

export type SinalitePriceState = {
  unitPriceCents: number | null;
  linePriceCents: number | null;
  currency: "USD" | "CAD";
};

type Args = {
  productId: number;
  optionIds: number[];
  store: Store;
  /** debounce ms (default 200) */
  debounceMs?: number;
};

type ApiOk = {
  ok: true;
  // support multiple shapes your codebase might return
  unitPrice?: number | string;
  unitPriceCents?: number;
  linePrice?: number | string;
  linePriceCents?: number;
  currency?: "USD" | "CAD";
};

type ApiErr = { ok: false; error?: string; detail?: unknown };
type ApiResp = ApiOk | ApiErr;

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeStoreCurrency(store: Store): "USD" | "CAD" {
  return store === "CA" ? "CAD" : "USD";
}

function normalizeOptionIds(optionIds: number[]): number[] {
  const ids = Array.isArray(optionIds) ? optionIds : [];
  const cleaned = ids
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0);
  cleaned.sort((a, b) => a - b);
  return cleaned;
}

async function safeJson(res: Response): Promise<unknown | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractPrices(json: unknown): { unitPriceCents: number | null; linePriceCents: number | null } {
  const j = json as any;
  if (!j || typeof j !== "object") return { unitPriceCents: null, linePriceCents: null };

  // Prefer cents if present
  const unitC = toNumber(j.unitPriceCents);
  const lineC = toNumber(j.linePriceCents);

  // Otherwise accept dollars and convert
  const unitD = toNumber(j.unitPrice);
  const lineD = toNumber(j.linePrice);

  return {
    unitPriceCents: unitC != null ? Math.round(unitC) : unitD != null ? Math.round(unitD * 100) : null,
    linePriceCents: lineC != null ? Math.round(lineC) : lineD != null ? Math.round(lineD * 100) : null,
  };
}

export function useSinalitePrice({ productId, optionIds, store, debounceMs = 200 }: Args) {
  const [state, setState] = useState<SinalitePriceState>(() => ({
    unitPriceCents: null,
    linePriceCents: null,
    currency: normalizeStoreCurrency(store),
  }));
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedOptionIds = useMemo(() => normalizeOptionIds(optionIds), [optionIds]);

  const key = useMemo(() => {
    return JSON.stringify({
      productId: Math.trunc(Number(productId) || 0),
      optionIds: normalizedOptionIds,
      store,
    });
  }, [productId, normalizedOptionIds, store]);

  useEffect(() => {
    // reset currency when store changes
    setState((prev) => ({
      ...prev,
      currency: normalizeStoreCurrency(store),
    }));
  }, [store]);

  useEffect(() => {
    // Cleanup any prior in-flight work
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);

    const pid = Math.trunc(Number(productId) || 0);
    if (!(pid > 0) || normalizedOptionIds.length === 0) {
      setLoading(false);
      setState((prev) => ({ ...prev, unitPriceCents: null, linePriceCents: null }));
      return;
    }

    const ctl = new AbortController();
    abortRef.current = ctl;

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/sinalite/price", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ productId: pid, optionIds: normalizedOptionIds, store }),
          cache: "no-store",
          signal: ctl.signal,
          credentials: "include",
        });

        const json = (await safeJson(res)) as ApiResp | null;

        if (!res.ok) {
          // don’t throw; just null out price
          if (!ctl.signal.aborted) {
            setState((prev) => ({ ...prev, unitPriceCents: null, linePriceCents: null }));
          }
          return;
        }

        if (!json || typeof json !== "object" || !("ok" in (json as any)) || (json as any).ok !== true) {
          if (!ctl.signal.aborted) {
            setState((prev) => ({ ...prev, unitPriceCents: null, linePriceCents: null }));
          }
          return;
        }

        const { unitPriceCents, linePriceCents } = extractPrices(json);
        const currency =
          (json as any)?.currency === "CAD" ? "CAD" : (json as any)?.currency === "USD" ? "USD" : normalizeStoreCurrency(store);

        if (!ctl.signal.aborted) {
          setState({ unitPriceCents, linePriceCents, currency });
        }
      } catch (e: unknown) {
        // ignore aborts; null out otherwise
        const err = e instanceof Error ? e : new Error("Unknown error");
        if ((err as any)?.name !== "AbortError" && !ctl.signal.aborted) {
          setState((prev) => ({ ...prev, unitPriceCents: null, linePriceCents: null }));
        }
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, Math.max(0, Math.trunc(Number(debounceMs) || 0)));

    return () => {
      ctl.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, productId, normalizedOptionIds, store, debounceMs]);

  return { ...state, loading };
}
