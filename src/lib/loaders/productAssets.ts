// src/lib/loaders/productAssets.ts
import "server-only";

import { readJsonFile } from "@/lib/loaders/readJsonFile";

export type ProductAsset = {
  id: number;
  category_id: number;
  subcategory_id: number | null;
  sinalite_id: number | null;
  sku: string;
  name: string;
  product_slug: string;
  canonical_uuid: string;
  slug: string;

  cf_image_1_id: string | null;
  cf_image_2_id: string | null;
  cf_image_3_id: string | null;
  cf_image_4_id: string | null;

  qa_has_image: boolean;

  category_slug: string | null;
  subcategory_slug: string | null;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function assertString(v: unknown, ctx: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${ctx} must be a non-empty string`);
  return v;
}

function assertStringOrNull(v: unknown, ctx: string): string | null {
  if (v === null) return null;
  if (typeof v !== "string") throw new Error(`${ctx} must be string|null`);
  const s = v.trim();
  return s ? s : null;
}

function assertNumber(v: unknown, ctx: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${ctx} must be a finite number`);
  return n;
}

function assertNumberOrNull(v: unknown, ctx: string): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${ctx} must be number|null`);
  return n;
}

function assertBoolean(v: unknown, ctx: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${ctx} must be a boolean`);
  return v;
}

function validateProductAssets(value: unknown, meta: { file: string }): ProductAsset[] {
  if (!Array.isArray(value)) throw new Error(`Expected array in ${meta.file}`);

  return value.map((row, i) => {
    if (!isObj(row)) throw new Error(`Row ${i} in ${meta.file} must be an object`);

    const id = assertNumber(row.id, `productAssets[${i}].id`);
    const category_id = assertNumber(row.category_id, `productAssets[${i}].category_id`);
    const subcategory_id = assertNumberOrNull(
      row.subcategory_id,
      `productAssets[${i}].subcategory_id`
    );
    const sinalite_id = assertNumberOrNull(row.sinalite_id, `productAssets[${i}].sinalite_id`);

    const sku = assertString(row.sku, `productAssets[${i}].sku`);
    const name = assertString(row.name, `productAssets[${i}].name`);
    const product_slug = assertString(row.product_slug, `productAssets[${i}].product_slug`);
    const canonical_uuid = assertString(
      row.canonical_uuid,
      `productAssets[${i}].canonical_uuid`
    );
    const slug = assertString(row.slug, `productAssets[${i}].slug`);

    const cf_image_1_id = assertStringOrNull(
      row.cf_image_1_id,
      `productAssets[${i}].cf_image_1_id`
    );
    const cf_image_2_id = assertStringOrNull(
      row.cf_image_2_id,
      `productAssets[${i}].cf_image_2_id`
    );
    const cf_image_3_id = assertStringOrNull(
      row.cf_image_3_id,
      `productAssets[${i}].cf_image_3_id`
    );
    const cf_image_4_id = assertStringOrNull(
      row.cf_image_4_id,
      `productAssets[${i}].cf_image_4_id`
    );

    const qa_has_image = assertBoolean(row.qa_has_image, `productAssets[${i}].qa_has_image`);

    const category_slug = assertStringOrNull(
      row.category_slug,
      `productAssets[${i}].category_slug`
    );
    const subcategory_slug = assertStringOrNull(
      row.subcategory_slug,
      `productAssets[${i}].subcategory_slug`
    );

    return {
      id,
      category_id,
      subcategory_id,
      sinalite_id,
      sku,
      name,
      product_slug,
      canonical_uuid,
      slug,
      cf_image_1_id,
      cf_image_2_id,
      cf_image_3_id,
      cf_image_4_id,
      qa_has_image,
      category_slug: category_slug ? category_slug.toLowerCase() : null,
      subcategory_slug: subcategory_slug ? subcategory_slug.toLowerCase() : null,
    };
  });
}

/**
 * Reads src/data/productAssets.json (typed + validated).
 * Cached by default for performance. If you ever worry about memory,
 * set PRODUCT_ASSETS_NO_CACHE=1 and it will re-read each time.
 */
export async function readProductAssets(): Promise<ProductAsset[]> {
  const noCache =
    String(process.env.PRODUCT_ASSETS_NO_CACHE ?? "").trim().toLowerCase() === "1";

  return readJsonFile<ProductAsset[]>({
    relPath: "src/data/productAssets.json",
    validate: validateProductAssets,
    cache: !noCache,
  });
}
