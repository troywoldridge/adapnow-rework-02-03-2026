// src/lib/data.ts
// Centralized image + asset helpers (Cloudflare CDN + Sinalite-aligned data)
// Uses categoryAssets.json, subcategoryAssets.json, productAssets.json

import slugify from "slugify";

import categoryAssets from "@/data/categoryAssets.json";
import subcategoryAssets from "@/data/subcategoryAssets.json";
import productAssets from "@/data/productAssets.json";

import { cfImage } from "@/lib/cfImages";

/* ===============================
   Slug helper
   =============================== */

function toSlug(s: string | null | undefined) {
  const v = (s ?? "").toString().trim();
  if (!v) return "";
  return slugify(v, { lower: true, strict: true, trim: true });
}

/* ===============================
   Types (loose, tolerant to columns)
   =============================== */

export type CategoryAsset = {
  slug: string;
  name?: string;
  category_id?: number;
  sort_order?: number;
  cf_image_id?: string | null;
  [k: string]: unknown;
};

export type SubcategoryAsset = {
  slug: string;
  name?: string;
  subcategory_id?: number;
  category_id?: number;
  sort_order?: number;
  cf_image_id?: string | null;
  [k: string]: unknown;
};

export type ProductAsset = {
  sinalite_id?: number;
  id?: number;
  category_id?: number;
  subcategory_id?: number;
  sku?: string;
  name?: string;
  canonical_uuid?: string | null;
  [k: string]: unknown;
};

/* ===============================
   In-memory maps for fast lookup
   =============================== */

// Categories — guarantee slug
const categoryBySlug = new Map<string, CategoryAsset>();
for (const r of categoryAssets as Array<Record<string, unknown>>) {
  const rawSlug = (r as any).slug as string | undefined;
  const ensured = (rawSlug && rawSlug.trim()) || toSlug((r as any).name as string | undefined);
  if (!ensured) continue;
  const row = { ...(r as object), slug: ensured } as CategoryAsset;
  categoryBySlug.set(ensured, row);
}

// Subcategories — guarantee slug
const subcategoryBySlug = new Map<string, SubcategoryAsset>();
for (const r of subcategoryAssets as Array<Record<string, unknown>>) {
  const rawSlug = (r as any).slug as string | undefined;
  const ensured = (rawSlug && rawSlug.trim()) || toSlug((r as any).name as string | undefined);
  if (!ensured) continue;
  const row = { ...(r as object), slug: ensured } as SubcategoryAsset;
  subcategoryBySlug.set(ensured, row);
}

// For products, index by slug/sku/id and collect Cloudflare image IDs
type ProductIndexRecord = {
  slug?: string;
  sku?: string;
  id?: number;
  sinalite_id?: number;
  imageIds: string[];
  raw: ProductAsset;
};

const productsBySlug = new Map<string, ProductIndexRecord>();
const productsBySku = new Map<string, ProductIndexRecord>();
const productsById = new Map<number, ProductIndexRecord>();

function pickProductSlug(p: ProductAsset) {
  return (
    (p["slugs (products)"] as string) ??
    (p["product_slug"] as string) ??
    (p["slug"] as string) ??
    (p["slugs"] as string) ??
    ""
  );
}

function collectProductImageIds(p: ProductAsset): string[] {
  const ids: string[] = [];
  const keys = ["cf_image_1_id", "cf_image_2_id", "cf_image_3_id", "cf_image_4_id"];
  for (const k of keys) {
    const val = p[k] as string | null | undefined;
    if (typeof val === "string" && val.trim()) ids.push(val.trim());
  }
  const single = p["cf_image_id"] as string | null | undefined;
  if (typeof single === "string" && single.trim() && ids.length === 0) {
    ids.push(single.trim());
  }
  return ids;
}

for (const raw of productAssets as ProductAsset[]) {
  const slugRaw = pickProductSlug(raw)?.toString().trim();
  const slug = slugRaw ? toSlug(slugRaw) : "";
  const sku = (raw.sku ?? "").toString().trim();

  const idNum = typeof raw.id === "number" ? raw.id : Number(raw.id);
  const id = Number.isFinite(idNum) ? idNum : undefined;

  const sinaliteNum = typeof raw.sinalite_id === "number" ? raw.sinalite_id : Number(raw.sinalite_id);
  const sinalite_id = Number.isFinite(sinaliteNum) ? sinaliteNum : undefined;

  const rec: ProductIndexRecord = {
    slug: slug || undefined,
    sku: sku || undefined,
    id,
    sinalite_id,
    imageIds: collectProductImageIds(raw),
    raw,
  };

  if (rec.slug) productsBySlug.set(rec.slug, rec);
  if (rec.sku) productsBySku.set(rec.sku, rec);
  if (rec.id !== undefined) productsById.set(rec.id, rec);
}

/* ===============================
   Public helpers
   =============================== */

/** Get a category thumbnail URL by category slug (Cloudflare CDN). */
export function getCategoryThumb(categorySlug: string, variant: string = "categoryThumb"): string | null {
  const slug = toSlug(categorySlug);
  const row = categoryBySlug.get(slug);
  const id = typeof row?.cf_image_id === "string" ? row.cf_image_id.trim() : "";
  const url = id ? cfImage(id, variant as any) : "";
  return url || null;
}

/** Get a subcategory thumbnail URL by subcategory slug (Cloudflare CDN). */
export function getSubcategoryThumb(subcategorySlug: string, variant: string = "subcategoryThumb"): string | null {
  const slug = toSlug(subcategorySlug);
  const row = subcategoryBySlug.get(slug);
  const id = typeof row?.cf_image_id === "string" ? row.cf_image_id.trim() : "";
  const url = id ? cfImage(id, variant as any) : "";
  return url || null;
}

/** Get the product gallery image URLs by product slug (preferred), sku, or id. */
export function getProductGallery(
  key: { slug?: string; sku?: string; id?: number | string },
  variant: string = "productTile",
): string[] {
  const slug = key.slug ? toSlug(key.slug) : "";
  const sku = (key.sku ?? "").toString().trim();
  const id =
    key.id === undefined || key.id === null
      ? undefined
      : typeof key.id === "number"
        ? key.id
        : Number(key.id);

  let rec: ProductIndexRecord | undefined;
  if (slug) rec = productsBySlug.get(slug);
  if (!rec && sku) rec = productsBySku.get(sku);
  if (!rec && id !== undefined && Number.isFinite(id)) rec = productsById.get(id);

  if (!rec || !rec.imageIds.length) return [];

  const out: string[] = [];
  for (const img of rec.imageIds) {
    const u = cfImage(img, variant as any);
    if (u) out.push(u);
  }
  return out;
}

/** Get the FIRST/hero image for a product (slug/sku/id). */
export function getProductHero(
  key: { slug?: string; sku?: string; id?: number | string },
  variant: string = "public",
): string | null {
  const gallery = getProductGallery(key, variant);
  return gallery[0] ?? null;
}

/* ===============================
   Optional: expose maps in dev only
   =============================== */

const EXPOSE_MAPS =
  (process.env.NEXT_PUBLIC_DEV_EXPOSE_ASSET_MAPS ?? "").trim() === "1" ||
  (process.env.DEV_EXPOSE_ASSET_MAPS ?? "").trim() === "1";

export const __categoryMap = EXPOSE_MAPS ? categoryBySlug : undefined;
export const __subcategoryMap = EXPOSE_MAPS ? subcategoryBySlug : undefined;
export const __productsBySlug = EXPOSE_MAPS ? productsBySlug : undefined;
export const __productsBySku = EXPOSE_MAPS ? productsBySku : undefined;
export const __productsById = EXPOSE_MAPS ? productsById : undefined;
