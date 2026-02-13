// src/lib/productResolver.ts
// Resolve product metadata by ID: prefers sinalite_products DB, falls back to JSON.

import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sinaliteProducts } from "@/lib/db/schema";

import productAssetsRaw from "@/data/productAssets.json";

type ProductInfo = {
  name?: string | null;
  cf_image_1_id?: string | null;
};

type JsonRow = {
  id?: number;
  product_id?: number;
  name?: string | null;
  cf_image_1_id?: string | null;
};

const jsonById = new Map<number, ProductInfo>();
const rows = Array.isArray(productAssetsRaw) ? (productAssetsRaw as JsonRow[]) : [];
for (const r of rows) {
  const pid = r.product_id ?? r.id;
  if (typeof pid === "number" && pid > 0) {
    jsonById.set(pid, {
      name: r.name ?? null,
      cf_image_1_id: r.cf_image_1_id ?? null,
    });
  }
}

/**
 * Resolve product name and image by product ID.
 * Prefers sinalite_products when populated; falls back to productAssets.json.
 */
export async function getProductById(productId: number): Promise<ProductInfo> {
  const fromJson = jsonById.get(productId) ?? { name: null, cf_image_1_id: null };

  try {
    const row = await db.query.sinaliteProducts.findFirst({
      where: eq(sinaliteProducts.productId, productId),
      columns: { name: true },
    });

    if (row?.name) {
      return {
        name: row.name,
        cf_image_1_id: fromJson.cf_image_1_id ?? null,
      };
    }
  } catch {
    // DB unavailable or error; use JSON fallback
  }

  return fromJson;
}

/**
 * Batch resolve multiple product IDs. More efficient than N single lookups.
 */
export async function getProductsByIds(
  productIds: number[]
): Promise<Map<number, ProductInfo>> {
  const result = new Map<number, ProductInfo>();

  // Start with JSON fallback for all
  for (const pid of productIds) {
    const fromJson = jsonById.get(pid);
    result.set(pid, fromJson ?? { name: null, cf_image_1_id: null });
  }

  try {
    const unique = [...new Set(productIds)].filter((n) => n > 0);
    if (unique.length === 0) return result;

    const dbRows = await db
      .select({ productId: sinaliteProducts.productId, name: sinaliteProducts.name })
      .from(sinaliteProducts)
      .where(inArray(sinaliteProducts.productId, unique));

    for (const r of dbRows) {
      if (r.name) {
        const existing = result.get(r.productId) ?? {};
        result.set(r.productId, {
          ...existing,
          name: r.name,
        });
      }
    }
  } catch {
    // DB unavailable; JSON values already in result
  }

  return result;
}
