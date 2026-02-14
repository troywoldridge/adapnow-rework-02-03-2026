// src/lib/cfImageResolver.ts
// Resolves a Cloudflare Image **ID** for a given product by checking productAssets.json,
// optionally falling back to subcategory/category using Sinalite product meta.
//
// NOTE: This returns an Image *ID*, not a URL.
// Your URL builder (imagedelivery.net) should be elsewhere (cfUrl helpers).

import "server-only";

import productAssets from "@/data/productAssets.json";
import { getSinaliteProductMeta } from "@/lib/sinalite/sinalite.client";

type AssetRow = {
  product_id?: number | string | null;
  subcategory_id?: number | string | null;
  category_id?: number | string | null;
  cloudflare_id?: string | null;
  name?: string | null;
};

type SinaliteMetaLike = {
  category_id?: unknown;
  categoryId?: unknown;
  subcategory_id?: unknown;
  subCategoryId?: unknown;
  subcategoryId?: unknown;
};

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function toPosInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

function hasCfId(r: AssetRow): boolean {
  return !!clean(r.cloudflare_id);
}

function isPreferredName(name: unknown): boolean {
  return /main|hero|primary/i.test(String(name ?? ""));
}

function pickPreferred(candidateRows: AssetRow[]): string | null {
  if (!candidateRows.length) return null;

  const preferred = candidateRows.find((r) => hasCfId(r) && isPreferredName(r.name));
  if (preferred) return clean(preferred.cloudflare_id);

  const first = candidateRows.find((r) => hasCfId(r));
  return first ? clean(first.cloudflare_id) : null;
}

const rows: AssetRow[] = Array.isArray(productAssets) ? (productAssets as AssetRow[]) : [];

// Indexes for fast lookup
const productIndex = new Map<number, string>();
const subcategoryIndex = new Map<number, AssetRow[]>();
const categoryIndex = new Map<number, AssetRow[]>();

function pushIndex(map: Map<number, AssetRow[]>, key: number | null, row: AssetRow) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) existing.push(row);
  else map.set(key, [row]);
}

// Build indexes once at module load (server-only)
for (const r of rows) {
  const cfId = clean(r.cloudflare_id);

  const pid = toPosInt(r.product_id);
  if (pid && cfId && !productIndex.has(pid)) {
    productIndex.set(pid, cfId);
  }

  pushIndex(subcategoryIndex, toPosInt(r.subcategory_id), r);
  pushIndex(categoryIndex, toPosInt(r.category_id), r);
}

function getSubcategoryIds(meta: SinaliteMetaLike | null): number[] {
  const ids = [
    toPosInt(meta?.subcategory_id),
    toPosInt(meta?.subCategoryId),
    toPosInt(meta?.subcategoryId),
  ].filter((x): x is number => typeof x === "number");
  // de-dupe while preserving order
  return Array.from(new Set(ids));
}

function getCategoryIds(meta: SinaliteMetaLike | null): number[] {
  const ids = [toPosInt(meta?.category_id), toPosInt(meta?.categoryId)].filter(
    (x): x is number => typeof x === "number",
  );
  return Array.from(new Set(ids));
}

/** Returns Cloudflare image **ID** (not a URL) or null */
export async function cfImageIdForProductStrict(productId: number): Promise<string | null> {
  const pid = toPosInt(productId);
  if (!pid) return null;

  // 1) direct product match
  const direct = productIndex.get(pid);
  if (direct) return direct;

  // 2) need meta → subcategory → category fallback
  let meta: SinaliteMetaLike | null = null;
  try {
    meta = (await getSinaliteProductMeta(String(pid))) as unknown as SinaliteMetaLike;
  } catch {
    // ignore; we can only return null without meta
    meta = null;
  }

  // Subcategory candidates (preferred)
  for (const subId of getSubcategoryIds(meta)) {
    const matches = subcategoryIndex.get(subId) ?? [];
    const pick = pickPreferred(matches);
    if (pick) return pick;
  }

  // Category candidates
  for (const catId of getCategoryIds(meta)) {
    const matches = categoryIndex.get(catId) ?? [];
    const pick = pickPreferred(matches);
    if (pick) return pick;
  }

  return null;
}
