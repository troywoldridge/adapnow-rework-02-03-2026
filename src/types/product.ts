// src/types/product.ts
/**
 * This project previously tried to re-export `Product` from ./storefront,
 * but ./storefront does not export a `Product` member (TS2305).
 *
 * Fix: define a stable `Product` type locally (used across UI/routes),
 * and keep this file as the canonical import target: `@/types/product`.
 *
 * If you still want to re-export other storefront types later, do it explicitly
 * once ./storefront exports them.
 */

export type Id = string | number;

export type Product = {
  id: Id;

  // Common storefront fields
  name?: string | null;
  slug?: string | null;
  description?: string | null;

  // ADAP/Sinalite sync fields (used throughout your app)
  sinalite_id?: Id | null;
  sku?: string | null;

  category_id?: Id | null;
  category_slug?: string | null;

  subcategory_id?: Id | null;
  subcategory_slug?: string | null;

  product_slug?: string | null;

  // Images (Cloudflare / internal)
  cf_image_1_id?: string | null;

  // Sorting / misc
  sort_order?: number | string | null;

  // Allow additional unknown fields coming from JSON/assets/db rows
  [k: string]: any;
};
