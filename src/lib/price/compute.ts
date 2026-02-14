import "server-only";

import { priceByOptionIds, resolveStoreCode } from "@/lib/sinalite.server";
import { applyTieredMarkup, type Store } from "@/lib/pricing";

type Currency = "USD" | "CAD";

/** Inputs for price calculation (server-only). */
export type ComputePriceInput = {
  productId: number;
  store: Store; // "US" | "CA"
  quantity: number; // selected qty
  optionIds: number[]; // exact chain for /price
  categoryId?: number | null; // reserved for future per-category tiers
  subcategoryId?: number | null;
};

/** Output (cents) used by Buy Box + Cart. */
export type ComputePriceResult = {
  ok: true;
  currency: Currency;
  qty: number;

  unitSellCents: number; // our retail (per-each)
  lineSellCents: number; // our retail (total)

  unitCostCents: number; // trade cost from Sinalite (per-each)
  lineCostCents: number; // trade cost from Sinalite (total)
};

type UpstreamPriceShape = {
  // newer normalized outputs in your codebase
  unitPriceCents?: unknown;
  linePriceCents?: unknown;

  // sometimes upstream returns dollars
  unitPrice?: unknown; // dollars (e.g. "2.50" or 2.5)
  linePrice?: unknown; // dollars (e.g. "38.95" or 38.95)

  // common alternate keys
  unit_cost?: unknown;
  line_cost?: unknown;

  // nested responses (if you pass through raw API data)
  response?: {
    unitPriceCents?: unknown;
    linePriceCents?: unknown;
    unitPrice?: unknown;
    linePrice?: unknown;
  } | null;
};

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toPositiveInt(v: unknown, fallback = 1): number {
  const n = toInt(v, fallback);
  return n > 0 ? n : fallback;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Strict money "xx.yy" normalization when string is provided.
 * Accepts:
 * - number: treated as dollars, normalized to cents
 * - string: if "38.95" -> cents, otherwise best-effort number parse (fallback 0)
 */
function dollarsToCents(v: unknown): number {
  if (v == null) return 0;

  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.round(v * 100);
  }

  const s = String(v).trim();
  if (!s) return 0;

  // If already strict "38.95"
  if (/^\d+(\.\d{2})$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  // Best-effort parse (still safe)
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function normalizeOptionIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const out: number[] = [];
  for (const x of ids) {
    const n = Number(x);
    if (Number.isFinite(n)) out.push(Math.trunc(n));
  }
  return out;
}

/**
 * Extract upstream cost in cents.
 * Supports:
 * - explicit cents fields (preferred)
 * - dollars fields (your newer normalization: "38.95")
 */
function extractUpstreamCostCents(upstream: UpstreamPriceShape, qty: number): { unitCostCents: number; lineCostCents: number } {
  const u = upstream ?? ({} as UpstreamPriceShape);
  const r = (u.response ?? null) as UpstreamPriceShape["response"];

  // 1) Prefer line cents (most accurate)
  const lineCentsCandidates = [
    u.linePriceCents,
    r?.linePriceCents,
    u.line_cost,
    u.lineCostCents as any,
  ];

  for (const c of lineCentsCandidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) {
      const lineCostCents = Math.round(n);
      const unitCostCents = Math.max(0, Math.round(lineCostCents / qty));
      return { unitCostCents, lineCostCents };
    }
  }

  // 2) Unit cents
  const unitCentsCandidates = [
    u.unitPriceCents,
    r?.unitPriceCents,
    u.unit_cost,
    u.unitCostCents as any,
  ];

  for (const c of unitCentsCandidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) {
      const unitCostCents = Math.round(n);
      const lineCostCents = Math.max(0, unitCostCents * qty);
      return { unitCostCents, lineCostCents };
    }
  }

  // 3) Dollars line (new canonical like "38.95")
  const lineDollarCandidates = [u.linePrice, r?.linePrice];
  for (const c of lineDollarCandidates) {
    const cents = dollarsToCents(c);
    if (cents > 0) {
      const lineCostCents = cents;
      const unitCostCents = Math.max(0, Math.round(lineCostCents / qty));
      return { unitCostCents, lineCostCents };
    }
  }

  // 4) Dollars unit
  const unitDollarCandidates = [u.unitPrice, r?.unitPrice];
  for (const c of unitDollarCandidates) {
    const unitCostCents = dollarsToCents(c);
    if (unitCostCents >= 0) {
      const lineCostCents = Math.max(0, unitCostCents * qty);
      return { unitCostCents, lineCostCents };
    }
  }

  return { unitCostCents: 0, lineCostCents: 0 };
}

/**
 * Canonical pricing:
 * Sinalite trade cost -> tiered markup (line-level).
 */
export async function computePrice(input: ComputePriceInput): Promise<ComputePriceResult> {
  const qty = toPositiveInt(input.quantity, 1);
  const optionIds = normalizeOptionIds(input.optionIds);

  if (!Number.isFinite(Number(input.productId)) || Number(input.productId) <= 0) {
    throw new Error("computePrice: invalid productId");
  }
  if (optionIds.length === 0) {
    throw new Error("computePrice: optionIds required");
  }

  const storeCode = resolveStoreCode(input.store); // 9 US / 6 CA

  // 🔗 Sinalite API
  const upstream = (await priceByOptionIds({
    productId: Number(input.productId),
    storeCode,
    optionIds,
  })) as unknown as UpstreamPriceShape;

  const { unitCostCents, lineCostCents } = extractUpstreamCostCents(upstream, qty);

  // 📈 Apply tiered markup on the LINE total
  const marked = await applyTieredMarkup({
    store: input.store,
    quantity: qty,
    lineCostCents,
  });

  // Ensure unitSellCents * qty == lineSellCents (no drift).
  // If applyTieredMarkup already guarantees this, this is a harmless safety net.
  let unitSellCents = toInt(marked.unitSellCents, 0);
  let lineSellCents = toInt(marked.lineSellCents, unitSellCents * qty);

  if (unitSellCents < 0) unitSellCents = 0;
  if (lineSellCents < 0) lineSellCents = 0;

  // Normalize so totals are consistent.
  const recomposed = unitSellCents * qty;
  if (recomposed !== lineSellCents) {
    // Prefer keeping the authoritative line total (it’s what you charge).
    // Recompute unit by rounding down; last unit implied by line/qty in UI if needed.
    unitSellCents = qty > 0 ? Math.floor(lineSellCents / qty) : lineSellCents;
  }

  const currency: Currency = input.store === "CA" ? "CAD" : "USD";

  return {
    ok: true,
    currency,
    qty,
    unitSellCents,
    lineSellCents,
    unitCostCents,
    lineCostCents,
  };
}
