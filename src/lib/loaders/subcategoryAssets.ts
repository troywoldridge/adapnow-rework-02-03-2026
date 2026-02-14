// src/lib/loaders/subcategoryAssets.ts
import "server-only";

import { readJsonFile } from "@/lib/loaders/readJsonFile";

export type SubcategoryAsset = {
  id: number;
  category_id: number | null;
  name: string;
  cf_image_id: string | null;
  category_slug: string | null;
  qa_has_image: boolean;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function assertStringOrNull(v: unknown, ctx: string): string | null {
  if (v === null) return null;
  if (typeof v !== "string") throw new Error(`${ctx} must be string|null`);
  const s = v.trim();
  return s ? s : null;
}

function assertString(v: unknown, ctx: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${ctx} must be a non-empty string`);
  return v;
}

function assertNumberOrNull(v: unknown, ctx: string): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${ctx} must be number|null`);
  return n;
}

function assertNumber(v: unknown, ctx: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${ctx} must be a finite number`);
  return n;
}

function assertBoolean(v: unknown, ctx: string): boolean {
  if (typeof v !== "boolean") throw new Error(`${ctx} must be a boolean`);
  return v;
}

function validateSubcategoryAssets(value: unknown, meta: { file: string }): SubcategoryAsset[] {
  if (!Array.isArray(value)) throw new Error(`Expected array in ${meta.file}`);

  return value.map((row, i) => {
    if (!isObj(row)) throw new Error(`Row ${i} in ${meta.file} must be an object`);

    const id = assertNumber(row.id, `subcategoryAssets[${i}].id`);
    const category_id = assertNumberOrNull(row.category_id, `subcategoryAssets[${i}].category_id`);
    const name = assertString(row.name, `subcategoryAssets[${i}].name`);
    const cf_image_id = assertStringOrNull(row.cf_image_id, `subcategoryAssets[${i}].cf_image_id`);
    const category_slug = assertStringOrNull(
      row.category_slug,
      `subcategoryAssets[${i}].category_slug`
    );
    const qa_has_image = assertBoolean(row.qa_has_image, `subcategoryAssets[${i}].qa_has_image`);

    return {
      id,
      category_id,
      name,
      cf_image_id,
      category_slug: category_slug ? category_slug.toLowerCase() : null,
      qa_has_image,
    };
  });
}

/**
 * Reads src/data/subcategoryAssets.json (typed + validated).
 * Cached by default for performance.
 */
export async function readSubcategoryAssets(): Promise<SubcategoryAsset[]> {
  return readJsonFile<SubcategoryAsset[]>({
    relPath: "src/data/subcategoryAssets.json",
    validate: validateSubcategoryAssets,
    cache: true,
  });
}
