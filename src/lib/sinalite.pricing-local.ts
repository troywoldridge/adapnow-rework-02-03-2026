/**
 * Client-safe local pricing index helpers.
 *
 * Mirrors `src/lib/sinalite/pricingIndex.ts` behavior, but without `server-only`
 * so product configurator client components can consume it.
 */

export type PricingIndexHit = {
  price: number;
  packageInfo?: unknown;
};

export type PricingIndex = Map<string, PricingIndexHit>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIdsArrayFromProductOptions(po: unknown): number[] {
  if (!po) return [];

  if (Array.isArray(po)) {
    return po
      .map((x) => toFiniteNumber(x))
      .filter((x): x is number => x !== null);
  }

  if (isRecord(po)) {
    return Object.values(po)
      .map((x) => toFiniteNumber(x))
      .filter((x): x is number => x !== null);
  }

  return [];
}

function normalizeIdsFromRow(row: unknown): number[] {
  if (!isRecord(row)) return [];

  if ("productOptions" in row) return toIdsArrayFromProductOptions(row.productOptions);
  if ("options" in row) return toIdsArrayFromProductOptions(row.options);
  if ("optionIds" in row) return toIdsArrayFromProductOptions(row.optionIds);
  if ("combo" in row) return toIdsArrayFromProductOptions(row.combo);
  if ("combination" in row) return toIdsArrayFromProductOptions(row.combination);

  if ("response" in row && isRecord(row.response) && "productOptions" in row.response) {
    return toIdsArrayFromProductOptions(row.response.productOptions);
  }

  return [];
}

function extractPrice(row: unknown): number | null {
  if (!isRecord(row)) return null;

  const candidates: unknown[] = [];

  if ("price" in row) candidates.push(row.price);

  if ("price2" in row && isRecord(row.price2) && "price" in row.price2) {
    candidates.push(row.price2.price);
  }

  if ("response" in row && isRecord(row.response) && "price" in row.response) {
    candidates.push(row.response.price);
  }

  for (const c of candidates) {
    const n = toFiniteNumber(c);
    if (n !== null) return n;
  }

  return null;
}

function extractPackageInfo(row: unknown): unknown | undefined {
  if (!isRecord(row)) return undefined;

  if ("packageInfo" in row) return row.packageInfo;

  if ("response" in row && isRecord(row.response) && "packageInfo" in row.response) {
    return row.response.packageInfo;
  }

  return undefined;
}

function keyFromIds(ids: number[]): string {
  return ids.slice().sort((a, b) => a - b).join("-");
}

export function buildPricingIndex(pricingArray: unknown[]): PricingIndex {
  const idx: PricingIndex = new Map();

  for (const row of Array.isArray(pricingArray) ? pricingArray : []) {
    const ids = normalizeIdsFromRow(row);
    if (ids.length === 0) continue;

    const price = extractPrice(row);
    if (price === null) continue;

    const pkg = extractPackageInfo(row);

    idx.set(keyFromIds(ids), {
      price,
      ...(pkg !== undefined ? { packageInfo: pkg } : {}),
    });
  }

  return idx;
}

export function resolveLocalPrice(optionIds: number[], pricingIndex: PricingIndex): PricingIndexHit | null {
  if (!Array.isArray(optionIds) || optionIds.length === 0) return null;
  const hit = pricingIndex.get(keyFromIds(optionIds));
  return hit ?? null;
}
