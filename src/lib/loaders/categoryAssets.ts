// src/lib/loaders/categoryAssets.ts
import "server-only";

import { readJsonFile } from "@/lib/loaders/readJsonFile";

export type CategoryAsset = {
  id: number;
  slug: string;
  name: string;
  cf_image_id: string; // in your sample it's always present; keep strict
  sort_order: number;
  qa_has_image: boolean;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function assertString(v: unknown, ctx: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`${ctx} must be a non-empty string`);
  }
  return v;
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

function validateCategoryAssets(value: unknown, meta: { file: string }): CategoryAsset[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array in ${meta.file}`);
  }

  return value.map((row, i) => {
    if (!isObj(row)) throw new Error(`Row ${i} in ${meta.file} must be an object`);

    const id = assertNumber(row.id, `categoryAssets[${i}].id`);
    const slug = assertString(row.slug, `categoryAssets[${i}].slug`).toLowerCase();
    const name = assertString(row.name, `categoryAssets[${i}].name`);
    const cf_image_id = assertString(row.cf_image_id, `categoryAssets[${i}].cf_image_id`);
    const sort_order = assertNumber(row.sort_order, `categoryAssets[${i}].sort_order`);
    const qa_has_image = assertBoolean(row.qa_has_image, `categoryAssets[${i}].qa_has_image`);

    return { id, slug, name, cf_image_id, sort_order, qa_has_image };
  });
}

/**
 * Reads src/data/categoryAssets.json (typed + validated).
 * Cached by default for performance.
 */
export async function readCategoryAssets(): Promise<CategoryAsset[]> {
  return readJsonFile<CategoryAsset[]>({
    relPath: "src/data/categoryAssets.json",
    validate: validateCategoryAssets,
    cache: true,
  });
}
