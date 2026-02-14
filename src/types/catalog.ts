// src/types/catalog.ts
/**
 * Canonical domain types for ADAP Now / Sinalite-backed catalog.
 *
 * Notes:
 * - In the app, timestamps should generally be represented as Date (not strings).
 * - DB rows may come back as strings depending on driver/serialization; normalize in your mappers.
 * - IDs are kept aligned with your DB reality:
 *   - Category.id is text (string)
 *   - Subcategory/Product/etc are numeric (number)
 */

export type ISO2Country = string; // e.g. "US", "CA" (validate in lib layer when needed)
export type CurrencyCode = "USD" | "CAD" | (string & {});

/** Useful helper for JSON-ish fields. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [k: string]: JsonValue };

export type JsonObject = { [k: string]: JsonValue };

/* ---------------- Catalog: Category / Subcategory ---------------- */

export interface Category {
  /** text primary key */
  id: string;

  /** URL-safe slug */
  slug: string;

  /** Display name */
  name: string;

  description?: string | null;

  createdAt: Date;
  updatedAt: Date;

  /** Optional soft-delete compatibility (if you add it later) */
  deletedAt?: Date | null;
}

export interface Subcategory {
  /** serial/int PK */
  id: number;

  /** FK to categories.id (text) */
  categoryId: string;

  slug: string;
  name: string;

  description?: string | null;

  createdAt: Date;
  updatedAt: Date;

  deletedAt?: Date | null;
}

/* ---------------- Product ---------------- */

export interface Product {
  id: number;

  sku: string;
  name: string;

  /**
   * Legacy label used in older datasets.
   * Prefer categoryId/category relations going forward.
   */
  categoryLabel: string;

  metadata?: JsonObject | null;

  subcategoryId?: number | null;
  slug?: string | null;

  /** FK to categories.id (text) */
  categoryId?: string | null;

  /** External supplier ID (Sinalite product ID) */
  sinaliteId?: string | null;

  createdAt: Date;
  updatedAt: Date;

  deletedAt?: Date | null;
}

/* ---------------- Options ---------------- */

export interface OptionGroup {
  id: number;
  productId: number;

  /** Human label / group key (e.g. "qty", "size", "coating") */
  groupName: string;

  /** Optional sorting to control UI order */
  sortOrder?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface Option {
  id: number;
  productId: number;

  /** Optional supplier SKU */
  sku?: string | null;

  /** Supplier option id (often numeric in Sinalite data, but stored as string sometimes) */
  optionId?: string | null;

  /** Group key matching OptionGroup.groupName */
  group: string;

  /** Display label */
  name: string;

  hidden?: boolean;

  /** Optional ordering for UI within group */
  sortOrder?: number;

  createdAt: Date;
  updatedAt: Date;

  deletedAt?: Date | null;
}

/* ---------------- Variants ---------------- */

export interface ProductVariant {
  id: number;
  productId: number;

  variantSku?: string | null;

  /**
   * Option combination object (shape depends on supplier)
   * Example: { qty: 1000, size: 23, coating: 5 }
   */
  optionCombination?: JsonObject | null;

  createdAt?: Date;
  updatedAt?: Date;
}

/* ---------------- Pricing ---------------- */

export interface Pricing {
  id: number;

  /** legacy category label */
  category: string;

  /** product id (FK) */
  product: number;

  rowNumber: number;

  /** pricing hash */
  hash: string;

  /** numeric price (recommend storing cents in app, but DB may store numeric dollars) */
  value: number;

  type: string;

  markup?: number | null;

  createdAt: Date;
  updatedAt: Date;
}

/* ---------------- Images ---------------- */

export interface Image {
  id: number;

  filename: string;
  cdnFilename?: string | null;

  /** Cloudflare Images ID or R2 key depending on your system */
  cloudflareId: string;

  imageUrl: string;

  isMatched?: boolean;

  productId?: number | null;
  categoryId?: string | null;
  subcategoryId?: number | null;

  /** Variant name (thumb, preview, etc) */
  variant?: string;

  alt?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/* ---------------- Utility mappers ---------------- */

/**
 * Convert unknown/driver-returned timestamp to Date.
 * - Accepts Date, ISO string, number (ms), or null/undefined.
 */
export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  const s = String(v ?? "").trim();
  const d = s ? new Date(s) : new Date(0);
  return Number.isFinite(d.getTime()) ? d : new Date(0);
}
