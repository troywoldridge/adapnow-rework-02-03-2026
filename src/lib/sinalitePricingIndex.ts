// src/lib/sinalitePricingIndex.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Helpers for working with SinaLite pricing matrices.
 * - Normalizes various "combo" row shapes into numeric option-id arrays
 * - Extracts price/packageInfo from different tenant response shapes
 * - Builds a fast lookup index keyed by sorted option IDs
 */

type PricingHit = { price: number; packageInfo?: any };

function toIdsArrayFromProductOptions(po: any): number[] {
  if (!po) return [];
  if (Array.isArray(po)) {
    return po.map((n) => Number(n)).filter(Number.isFinite);
  }
  if (typeof po === "object") {
    return Object.values(po).map((n: any) => Number(n)).filter(Number.isFinite);
  }
  return [];
}

function normalizeIdsFromRow(row: any): number[] {
  if (!row || typeof row !== "object") return [];

  if ("productOptions" in row) return toIdsArrayFromProductOptions((row as any).productOptions);
  if ("options" in row) return toIdsArrayFromProductOptions((row as any).options);
  if ("optionIds" in row) return toIdsArrayFromProductOptions((row as any).optionIds);
  if ("combo" in row) return toIdsArrayFromProductOptions((row as any).combo);
  if ("combination" in row) return toIdsArrayFromProductOptions((row as any).combination);

  const resp = (row as any).response;
  if (resp?.productOptions) return toIdsArrayFromProductOptions(resp.productOptions);

  return [];
}

function extractPrice(row: any): number | null {
  if (!row || typeof row !== "object") return null;

  const candidates = [
    (row as any).price,
    (row as any).price2?.price,
    (row as any).response?.price,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function extractPackageInfo(row: any): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  return (row as any).packageInfo || (row as any).response?.packageInfo || null;
}

function keyFromIds(ids: number[]): string {
  // Stable key regardless of order/duplicates
  const uniq = Array.from(new Set(ids.map((n) => Number(n)).filter(Number.isFinite)));
  uniq.sort((a, b) => a - b);
  return uniq.join("-");
}

/** Build a fast lookup index from pricingArray rows. */
export function buildPricingIndex(pricingArray: any[]): Map<string, PricingHit> {
  const idx = new Map<string, PricingHit>();

  for (const row of pricingArray || []) {
    const ids = normalizeIdsFromRow(row);
    if (ids.length === 0) continue;

    const price = extractPrice(row);
    if (price == null) continue;

    const pkg = extractPackageInfo(row) ?? undefined;
    idx.set(keyFromIds(ids), { price: Number(price), packageInfo: pkg });
  }

  return idx;
}

/** Try to resolve a price locally from the matrix (selected option IDs). */
export function resolveLocalPrice(
  optionIds: number[],
  pricingIndex: Map<string, PricingHit>
): PricingHit | null {
  return pricingIndex.get(keyFromIds(optionIds)) ?? null;
}

/** Exposed for callers that want to key their own maps. */
export function pricingKey(optionIds: number[]): string {
  return keyFromIds(optionIds);
}
