// src/components/CartShippingEstimator.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveShipChoice, flushShipChoiceToCart, type ShippingChoice } from "@/lib/shippingChoice";

/** Minimal cart line payload for estimating shipping (per SinaLite docs). */
type MiniLine = { productId: number; optionIds: number[]; quantity?: number };

type Props = {
  initialCountry: "US" | "CA";
  initialState?: string;
  initialZip?: string;
  /** Lines to estimate; MUST include optionIds for correct packaging via SinaLite. */
  lines?: MiniLine[];
  /** Display currency only; server derives real currency from country. */
  currency?: "USD" | "CAD";
};

export type ShippingRate = {
  carrier: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: "USD" | "CAD";
  eta?: string | null;
  days?: number | null;
};

function normalizeUSZip(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, 5);
}

function normalizeCAPostal(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length <= 3) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)}`.trim();
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export default function CartShippingEstimator({
  initialCountry,
  initialState = "",
  initialZip = "",
  lines: linesProp,
  currency,
}: Props) {
  const router = useRouter();

  const [country, setCountry] = useState<"US" | "CA">(initialCountry);
  const [state, setState] = useState(initialState);
  const [zip, setZip] = useState(initialZip);

  // null = not fetched yet; [] = fetched, no rates; [..] = rates found
  const [rates, setRates] = useState<ShippingRate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const lines = useMemo(() => {
    const raw = Array.isArray(linesProp) ? linesProp : [];
    return raw
      .map((l) => ({
        productId: Number(l.productId),
        optionIds: Array.isArray(l.optionIds) ? l.optionIds.map((x) => Number(x)).filter(Number.isFinite) : [],
        quantity: Number.isFinite(Number(l.quantity)) ? Math.max(1, Math.floor(Number(l.quantity))) : 1,
      }))
      .filter((l) => Number.isFinite(l.productId) && l.productId > 0 && l.optionIds.length > 0);
  }, [linesProp]);

  const disabled = useMemo(() => {
    const needState = !state.trim();
    const needZip = !zip.trim();
    return !country || needState || needZip || lines.length === 0;
  }, [country, state, zip, lines.length]);

  const fmt = useCallback(
    (n: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || (country === "CA" ? "CAD" : "USD"),
      }).format(Number(n) || 0),
    [currency, country],
  );

  // Request live rates from our server route which calls SinaLite /order/shippingEstimate
  const onEstimate = useCallback(async () => {
    if (busy) return;

    setError(null);
    setBusy(true);

    // Cancel any in-flight estimate
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const normState = state.trim().toUpperCase();
      const rawZip = zip.trim();
      const normZip = country === "US" ? normalizeUSZip(rawZip) : normalizeCAPostal(rawZip);

      if (!normState) throw new Error(country === "US" ? "State is required" : "Province is required");
      if (!normZip) throw new Error(country === "US" ? "ZIP is required" : "Postal code is required");
      if (lines.length === 0) throw new Error("Cart lines are missing required options for shipping estimate");

      const payload = {
        country,
        state: normState,
        zip: normZip,
        lines: lines.map((l) => ({
          productId: l.productId,
          optionIds: l.optionIds,
          quantity: l.quantity ?? 1,
        })),
      };

      const res = await fetch("/api/cart/shipping/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: ac.signal,
      });

      const json = (await safeJson(res)) as { ok?: boolean; rates?: ShippingRate[]; error?: string } | null;

      if (!res.ok || !json?.ok) {
        const msg = json?.error || `Estimate failed (${res.status})`;
        throw new Error(msg);
      }

      setRates(Array.isArray(json.rates) ? json.rates : []);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "Could not estimate shipping");
      setRates(null);
    } finally {
      setBusy(false);
    }
  }, [busy, country, state, zip, lines]);

  // User picks a returned rate — persist to cart
  const onChoose = useCallback(
    async (r: ShippingRate) => {
      setError(null);

      const choice: ShippingChoice = {
        country,
        state: state.trim().toUpperCase(),
        zip: country === "US" ? normalizeUSZip(zip) : normalizeCAPostal(zip),
        carrier: r.carrier,
        method: r.serviceName, // review page expects "method"
        cost: r.amount,
        days: r.days ?? null,
        currency: r.currency,
      };

      try {
        saveShipChoice(choice);

        const res = await fetch("/api/cart/shipping/choose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(choice),
        });

        const json = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) throw new Error(json?.error || `Could not save shipping (${res.status})`);

        await flushShipChoiceToCart();
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "Could not save shipping selection");
      }
    },
    [country, state, zip, router],
  );

  // Let users continue without a live rate (manual quote flow)
  const onSkipForNow = useCallback(async () => {
    setError(null);

    const choice: ShippingChoice = {
      country,
      state: state.trim().toUpperCase(),
      zip: country === "US" ? normalizeUSZip(zip) : normalizeCAPostal(zip),
      carrier: "TBD",
      method: "Manual quote (no live rate)",
      cost: 0,
      days: null,
      currency: country === "CA" ? "CAD" : "USD",
    };

    try {
      saveShipChoice(choice);

      const res = await fetch("/api/cart/shipping/choose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(choice),
      });

      const json = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Could not save shipping (${res.status})`);

      await flushShipChoiceToCart();
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Could not continue without shipping");
    }
  }, [country, state, zip, router]);

  // Auto-estimate once enough info is present
  useEffect(() => {
    if (!busy && zip.trim() && state.trim() && lines.length > 0) onEstimate();
  }, [zip, state, lines.length, onEstimate, busy]);

  // Clean up in-flight request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Estimate shipping</h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">Country</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value === "CA" ? "CA" : "US")}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">
            {country === "US" ? "State" : "Province"}
          </label>
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
            placeholder={country === "US" ? "CA" : "ON"}
            autoComplete="address-level1"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">
            {country === "US" ? "ZIP" : "Postal code"}
          </label>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
            placeholder={country === "US" ? "94107" : "M5V 2T6"}
            autoComplete="postal-code"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onEstimate}
          disabled={disabled || busy}
          className="inline-flex h-9 items-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? "Estimating…" : "Get rates"}
        </button>
        {error ? <span className="text-sm text-rose-700">{error}</span> : null}
      </div>

      {/* Results */}
      {rates === null ? null : rates.length === 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-semibold text-amber-900">No live rates were returned.</div>
          <div className="mt-1 text-amber-900/90">
            This can happen for certain option combinations until SinaLite confirms packaging. You can retry, tweak the
            address, or continue without a live rate—we’ll confirm shipping before payment.
          </div>
          <ul className="mt-2 list-disc pl-4 text-amber-900/90">
            <li>Double-check State/Province and ZIP/Postal Code</li>
            <li>Try a nearby ZIP</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEstimate}
              className="inline-flex h-9 items-center rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onSkipForNow}
              className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Continue without shipping
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {rates.map((r, i) => (
            <div
              key={`${r.carrier}-${r.serviceCode}-${i}`}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-900">
                  {r.carrier} — {r.serviceName}
                </div>
                <div className="text-xs text-gray-600">
                  {r.eta ? r.eta : r.days != null ? `${r.days} business day${r.days === 1 ? "" : "s"}` : "ETA TBA"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-semibold">{fmt(r.amount)}</div>
                <button
                  type="button"
                  onClick={() => onChoose(r)}
                  className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Choose
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
