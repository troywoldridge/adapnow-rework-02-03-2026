// src/types/subcategory.ts
/**
 * ./storefront does not export `Subcategory` (TS2305).
 * Fix: make `@/types/subcategory` the canonical, stable type definition.
 */

export type Id = string | number;

export type Subcategory = {
  id: Id;

  // Sometimes legacy assets use `subcategory_id`
  subcategory_id?: Id | null;

  category_id?: Id | null;
  category_slug?: string | null;

  slug?: string | null;
  name?: string | null;
  description?: string | null;

  // Cloudflare Images / assets
  cf_image_id?: string | null;

  sort_order?: number | string | null;

  // Allow extra fields from JSON/assets/db rows
  [k: string]: any;
};
