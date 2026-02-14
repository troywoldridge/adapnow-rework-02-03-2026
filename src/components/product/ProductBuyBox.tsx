// src/components/product/ProductBuyBox.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/** Option+Group shape coming from the PDP */
type Option = { id: number; name: string };
type Group = { name: string; options: Option[] };

type Store = "US" | "CA";
type Currency = "USD" | "CAD";

type Props = {
  productId: number;
  productName: string; // not used here but safe to keep
  optionGroups: Group[];
  store: Store;
  cloudflareImageId?: string; // not used here but safe to keep
};

type PricingResp = {
  ok?: boolean;
  error?: string;
  currency?: Currency;
  lineSellCents?: number;
  unitSellCents?: number;
};

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}
function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}
function clampInt(n: number, min: number, max: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.floor(x)));
}
async function safeJson<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** Prefer finding a group by fuzzy name match (case-insensitive contains). */
function findGroupByNeedle(groups: Group[], needle: string): Group | undefined {
  const n = needle.toLowerCase();
  return groups.find((g) => safeStr(g?.name).toLowerCase().includes(n));
}

/** Quantity: parse from selected option's NAME (e.g., "25", "50"). */
function inferQuantity(optionGroups: Group[], choices: Record<string, string>): number {
  const g =
    findGroupByNeedle(optionGroups, "quantity") ||
    findGroupByNeedle(optionGroups, "qty") ||
    findGroupByNeedle(optionGroups, "quantities");

  if (!g) return 1;

  const selId = safeInt(choices[g.name], 0);
  const opt = g.options.find((o) => o.id === selId);
  const parsed = Number.parseInt(safeStr(opt?.name || "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Sides: best-effort. Defaults to 2. */
function inferSides(optionGroups: Group[], choices: Record<string, string>): number {
  const g = findGroupByNeedle(optionGroups, "side");
  if (!g) return 2;
  const selId = safeInt(choices[g.name], 0);
  const opt = g.options.find((o) => o.id === selId);
  const label = safeStr(opt?.name).toLowerCase();
  if (/\b2\b|two|double/.test(label)) return 2;
  if (/\b1\b|one|single/.test(label)) return 1;
  return 2;
}

export default function ProductBuyBox({
  productId,
  productName,
  optionGroups,
  store,
  cloudflareImageId,
}: Props) {
  void productName;
  void cloudflareImageId;

  const router = useRouter();

  /* --------------------- Selection State (string values) -------------------- */
  const [choices, setChoices] = useState<Record<string, string>>({});

  const get = useCallback((name: string) => choices[name] ?? "", [choices]);
  const set = useCallback((name: string, value: string) => {
    setChoices((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Initialize defaults (first option in each group) once the groups arrive.
  useEffect(() => {
    setChoices((prev) => {
      const next = { ...prev };
      for (const g of optionGroups || []) {
        const gn = safeStr(g?.name);
        if (!gn) continue;
        if (next[gn] == null && g.options?.length) next[gn] = String(g.options[0].id);
      }
      return next;
    });
  }, [optionGroups]);

  // Numeric selection object for APIs (groupName -> optionId)
  const numericSelection = useMemo(() => {
    const entries = Object.entries(choices).map(([k, v]) => [k, safeInt(v, 0)] as const);
    return Object.fromEntries(entries) as Record<string, number>;
  }, [choices]);

  // Option id list (numeric)
  const optionIds = useMemo(
    () => Object.values(numericSelection).filter((v) => Number.isFinite(v) && v > 0) as number[],
    [numericSelection],
  );

  const quantity = useMemo(() => inferQuantity(optionGroups, choices), [optionGroups, choices]);
  const sides = useMemo(() => inferSides(optionGroups, choices), [optionGroups, choices]);

  /* --------------------------- Pricing state/UI ---------------------------- */
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [unitPrice, setUnitPrice] = useState(0); // SELL, per-each (dollars)
  const [serverTotal, setServerTotal] = useState(0); // SELL, line total (dollars)
  const [currency, setCurrency] = useState<Currency>("USD");

  // Avoid JSON.stringify in deps; create a stable signature instead.
  const selectionSig = useMemo(() => {
    const parts = Object.entries(numericSelection)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`);
    return parts.join("|");
  }, [numericSelection]);

  // Fetch SELL price whenever the selection changes
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchPrice() {
      setLoadingPrice(true);
      setPriceError(null);

      try {
        const { total, curr } = await priceViaApi({
          productId,
          store,
          quantity,
          optionIds,
          signal: controller.signal,
        });

        if (cancelled) return;

        const q = Math.max(1, quantity || 1);
        setServerTotal(total); // dollars
        setUnitPrice(q > 0 ? total / q : total); // dollars
        setCurrency(curr);
      } catch (e: any) {
        if (cancelled) return;
        if (e?.name === "AbortError") return;

        setServerTotal(0);
        setUnitPrice(0);
        setPriceError(e?.message || "Invalid price in response");
      } finally {
        if (!cancelled) setLoadingPrice(false);
      }
    }

    if (optionIds.length > 0) fetchPrice();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [productId, store, quantity, selectionSig, optionIds]);

  /* ----------------------- Create line & navigate -------------------------- */
  const [navBusy, setNavBusy] = useState(false);

  const onAddAndUpload = useCallback(async () => {
    if (!optionIds.length || navBusy) return;

    setNavBusy(true);
    try {
      // We no longer send price to the server; server will reprice for integrity.
      const res = await fetch("/api/cart/lines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity, // server accepts quantity (and will normalize)
          optionIds, // numeric ids
          store, // so server knows US/CA context
        }),
        cache: "no-store",
      });

      const json = (await safeJson<any>(res)) ?? {};
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Could not create cart line (${res.status})`);
      }

      const lineId: string = safeStr(json.lineId ?? json?.line?.id ?? "");
      if (!lineId) throw new Error("Missing lineId in response");

      const nextSides = clampInt(sides, 1, 12);
      router.push(
        `/product/${encodeURIComponent(String(productId))}/upload-artwork?lineId=${encodeURIComponent(
          lineId,
        )}&sides=${encodeURIComponent(String(nextSides))}#side-1`,
      );
    } catch (e: any) {
      console.error("Add & Upload error:", e?.message || e);
    } finally {
      setNavBusy(false);
    }
  }, [navBusy, optionIds.length, productId, quantity, optionIds, sides, store, router]);

  /* --------------------------------- UI ----------------------------------- */
  const fmt = useCallback(
    (n: number) =>
      new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
        style: "currency",
        currency,
      }).format(Number(n) || 0),
    [currency],
  );

  return (
    <div className="space-y-4">
      {optionGroups.map((g) => (
        <div key={g.name} className="mb-3">
          <label className="mb-1.5 block font-semibold">{g.name}</label>
          <select
            className="w-full rounded-lg border border-gray-300"
            value={get(g.name)}
            onChange={(e) => set(g.name, e.currentTarget.value)}
          >
            {g.options.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div className="mt-4 space-y-1 font-semibold">
        <div>
          Price (each){loadingPrice ? "…" : ""}: {fmt(unitPrice)}
        </div>
        <div>Subtotal: {fmt(serverTotal)}</div>
        {priceError ? <div className="mt-1 text-red-700">{priceError}</div> : null}
      </div>

      <button
        type="button"
        onClick={onAddAndUpload}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow hover:bg-blue-800 disabled:opacity-50"
        disabled={optionIds.length === 0 || loadingPrice || navBusy}
      >
        {navBusy ? "Preparing…" : "Add & Upload Artwork"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LIVE PRICING (SELL): calls /api/price/pricing (markup applied)     */
/* Expects response (cents): { ok, currency, unitSellCents,           */
/*   lineSellCents }                                                  */
/* Returns dollars to the component for display.                      */
/* ------------------------------------------------------------------ */

async function priceViaApi(opts: {
  productId: number;
  store: Store;
  quantity: number;
  optionIds: number[];
  signal?: AbortSignal;
}): Promise<{ total: number; curr: Currency }> {
  const res = await fetch("/api/price/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productId: opts.productId,
      store: opts.store,
      quantity: Math.max(1, clampInt(opts.quantity, 1, 999999)),
      optionIds: opts.optionIds,
    }),
    cache: "no-store",
    signal: opts.signal,
  });

  const json = ((await safeJson<PricingResp>(res)) ?? {}) as PricingResp;
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Pricing failed (${res.status})`);
  }

  const curr: Currency = json.currency === "CAD" ? "CAD" : "USD";

  // Prefer lineSellCents; fall back to unitSellCents*qty if needed.
  const lineSellCents = Number(json.lineSellCents);
  if (Number.isFinite(lineSellCents)) return { total: lineSellCents / 100, curr };

  const unitSellCents = Number(json.unitSellCents);
  if (Number.isFinite(unitSellCents)) {
    return { total: (unitSellCents * Math.max(1, clampInt(opts.quantity, 1, 999999))) / 100, curr };
  }

  throw new Error("Invalid pricing response");
}
