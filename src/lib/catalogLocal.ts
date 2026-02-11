// src/lib/catalogLocal.ts
import "server-only";

import categoryAssets from "@/data/categoryAssets.json";
import subcategoryAssets from "@/data/subcategoryAssets.json";

function readEnv(key: string, fallback = ""): string {
  const v = (process.env as Record<string, string | undefined>)[key];
  const s = String(v ?? "").trim();
  return s || fallback;
}

const CF_ACCOUNT = readEnv("NEXT_PUBLIC_CF_ACCOUNT_HASH");
const CF_BASE = readEnv("NEXT_PUBLIC_IMAGE_DELIVERY_BASE", "https://imagedelivery.net").replace(/\/+$/, "");
const CF_VARIANT = readEnv("NEXT_PUBLIC_CF_IMAGE_VARIANT", "public");

function cfUrl(args: { imageId?: string | null; variant?: string | null; fallback?: string | null }): string | undefined {
  const imageId = String(args.imageId ?? "").trim();
  const variant = String(args.variant ?? "").trim() || CF_VARIANT;
  const fallback = String(args.fallback ?? "").trim();

  if (imageId && CF_ACCOUNT) {
    return `${CF_BASE}/${CF_ACCOUNT}/${imageId}/${variant}`;
  }
  return fallback || undefined; // falls back to any existing imageUrl in JSON
}

/** Local category JSON shape (categoryAssets.json) */
type CategoryAsset = {
  description?: string | null;
  imageId?: string | null;
  variant?: string | null;
  imageUrl?: string | null;
};

type CategoryAssetMap = Record<string, CategoryAsset>;

export type Category = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image?: string;
  imageId?: string;
  variant?: string;
};

/** Local subcategory JSON row shape (subcategoryAssets.json) */
type SubcategoryAssetRow = {
  id: string | number;
  slug: string;
  name: string;
  category_id: string;
  description?: string | null;
  cloudflare_image_id?: string | null;
  cloudflare_variant?: string | null;
  imageUrl?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Subcategory = {
  id: string | number;
  slug: string;
  name: string;
  categoryId: string;
  description?: string;
  /** Cloudflare URL if possible (or undefined) */
  image?: string | null;
  /** Original snake_case id from JSON */
  cloudflare_image_id?: string | null;
  /** Friendly alias (same as cloudflare_image_id) */
  imageId?: string | null;
  variant?: string | null;
  created_at?: string;
  updated_at?: string;
};

function titleize(slug: string): string {
  return String(slug ?? "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CATEGORY_MAP = categoryAssets as unknown as CategoryAssetMap;
const SUBCATEGORY_ROWS = (subcategoryAssets as unknown as SubcategoryAssetRow[]) ?? [];

function normalizeCategory(slug: string, data: CategoryAsset): Category {
  const image = cfUrl({
    imageId: data?.imageId ?? undefined,
    variant: data?.variant ?? undefined,
    fallback: data?.imageUrl ?? undefined,
  });

  return {
    id: slug,
    slug,
    name: titleize(slug),
    description: String(data?.description ?? "").trim(),
    image,
    imageId: data?.imageId ?? undefined,
    variant: data?.variant ?? undefined,
  };
}

function normalizeSubcategory(row: SubcategoryAssetRow): Subcategory {
  const img = cfUrl({
    imageId: row.cloudflare_image_id ?? undefined,
    variant: row.cloudflare_variant ?? undefined,
    fallback: row.imageUrl ?? undefined,
  });

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    categoryId: row.category_id,
    description: String(row.description ?? "").trim(),
    image: img ?? null,
    cloudflare_image_id: row.cloudflare_image_id ?? null,
    imageId: row.cloudflare_image_id ?? null,
    variant: row.cloudflare_variant ?? null,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  };
}

export function getLocalCategories(): Category[] {
  return Object.entries(CATEGORY_MAP).map(([slug, data]) => normalizeCategory(slug, data));
}

export function getLocalCategoryBySlug(slug: string): Category | null {
  const key = String(slug ?? "").trim();
  if (!key) return null;

  const data = CATEGORY_MAP[key];
  if (!data) return null;

  return normalizeCategory(key, data);
}

export function getLocalSubcategories(categorySlug?: string): Subcategory[] {
  const list = SUBCATEGORY_ROWS.map(normalizeSubcategory);
  if (!categorySlug) return list;

  const key = String(categorySlug ?? "").trim();
  return list.filter((s) => s.categoryId === key);
}

export function getLocalSubcategoriesByCategoryId(categoryId: string): Subcategory[] {
  return getLocalSubcategories(categoryId);
}

export function getLocalSubcategoryBySlug(slug: string): Subcategory | null {
  const key = String(slug ?? "").trim();
  if (!key) return null;

  // avoid rebuilding list twice
  for (const row of SUBCATEGORY_ROWS) {
    if (row.slug === key) return normalizeSubcategory(row);
  }
  return null;
}
