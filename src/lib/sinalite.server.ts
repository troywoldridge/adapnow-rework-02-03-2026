// src/lib/sinalite.server.ts
/**
 * Canonical Sinalite server utilities (auth wrapper + pricing + shipping + storefront).
 * Uses your existing getSinaliteAccessToken().
 *
 * Notes:
 * - API base is normalized (no trailing slash)
 * - All calls are no-store
 * - Adds small helpers for safer parsing + better errors
 */

import "server-only";

import { getEnv } from "@/lib/env";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

export const API_BASE = getEnv().SINALITE_BASE_URL || "https://api.sinaliteuppy.com";

/** Per Sinalite: 6 = Canada, 9 = US (legacy numeric code some endpoints use) */
export function resolveStoreCode(country: "US" | "CA"): 9 | 6 {
  return country === "US" ? 9 : 6;
}

/** Normalize to "Bearer <token>" even if getSinaliteAccessToken already includes it. */
export async function getSinaliteBearer(): Promise<string> {
  const raw = await getSinaliteAccessToken();
  return asBearer(raw);
}

function asBearer(token: string): string {
  const t = String(token ?? "").trim();
  if (!t) return "";
  return /^Bearer\s/i.test(t) ? t : `Bearer ${t}`;
}

function resolveStoreString(input?: string | null): string {
  const sc = (input ?? getEnv().NEXT_PUBLIC_STORE_CODE ?? "").trim();
  if (!sc) throw new Error("Missing storeCode (NEXT_PUBLIC_STORE_CODE).");
  return sc;
}

function buildUrl(baseUrl: string, path: string): string {
  const b = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const p = String(path ?? "").trim();
  const p2 = p.startsWith("/") ? p : `/${p}`;
  return `${b}${p2}`;
}

function truncate(s: string, max = 500): string {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export class SinaliteApiError extends Error {
  status: number;
  body?: string;
  path: string;

  constructor(message: string, status: number, path: string, body?: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

/** Typed fetch to Sinalite with auth + JSON, no-store cache. */
async function apiFetch<T>(
  path: string,
  init: RequestInit & { baseUrl?: string } = {}
): Promise<T> {
  const baseUrl = (init.baseUrl ?? API_BASE).trim().replace(/\/+$/, "");
  const token = asBearer(await getSinaliteAccessToken());

  if (!token) {
    throw new Error("Missing Sinalite access token (getSinaliteAccessToken returned empty).");
  }

  const url = buildUrl(baseUrl, path);

  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: token,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new SinaliteApiError(
      `Sinalite ${res.status} ${res.statusText} @ ${path} – ${truncate(text, 500)}`,
      res.status,
      path,
      text
    );
  }

  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    // Some upstream errors come back as plain text even with 200s in rare cases.
    throw new SinaliteApiError(
      `Sinalite returned non-JSON @ ${path} – ${truncate(text, 200)}`,
      502,
      path,
      text
    );
  }
}

/* ────────────────────────────────────────────────────────────
   STOREFRONT CATALOG HELPERS (SinaLite docs)
   GET /storefront/{store}/subcategories/{id}
   GET /storefront/{store}/subcategories/{id}/products
──────────────────────────────────────────────────────────── */

export type SubcategoryDetails = {
  id: number;
  name?: string;
  slug?: string;
  description?: string;
  image?: string;
};

export async function getSubcategoryDetails(
  subcategoryId: number,
  storeCode?: string
): Promise<SubcategoryDetails> {
  const sc = resolveStoreString(storeCode);
  const sid = encodeURIComponent(String(subcategoryId));
  return apiFetch<SubcategoryDetails>(
    `/storefront/${encodeURIComponent(sc)}/subcategories/${sid}`
  );
}

export type StorefrontProduct = {
  id: number | string;
  name: string;
  sku?: string;
  image?: string;
  category_id?: number | string;
  subcategory_id?: number | string;
  // any other keys from SinaLite are passed through by your merge layer
  [k: string]: unknown;
};

export async function getProductsBySubcategory(
  subcategoryId: number,
  storeCode?: string
): Promise<StorefrontProduct[]> {
  const sc = resolveStoreString(storeCode);
  const sid = encodeURIComponent(String(subcategoryId));
  return apiFetch<StorefrontProduct[]>(
    `/storefront/${encodeURIComponent(sc)}/subcategories/${sid}/products`
  );
}

/* ────────────────────────────────────────────────────────────
   PRICING  (POST /price/{productId}/{storeCodeNumeric})
   NOTE: SinaLite returns the JOB TOTAL (line price).
──────────────────────────────────────────────────────────── */

type PriceResp = {
  price?: string | number; // job total for selected chain
  packageInfo?: Record<string, string>;
  productOptions?: Record<string, string>; // group -> optionId
};

export async function priceByOptionIds(params: {
  productId: number;
  storeCode: 6 | 9;
  optionIds: (number | string)[];
  baseUrl?: string;
}): Promise<{ linePriceCents: number; optionsByGroup: Record<string, string> }> {
  const { productId, storeCode, optionIds, baseUrl } = params;

  const data = await apiFetch<PriceResp>(`/price/${productId}/${storeCode}`, {
    method: "POST",
    body: JSON.stringify({ productOptions: (optionIds || []).map((v) => String(v)) }),
    baseUrl,
  });

  // IMPORTANT: `price` is the full job total for the current option chain (Qty included).
  const priceNum = Number(data?.price);
  const linePriceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : 0;

  const optionsByGroup = (data?.productOptions ?? {}) as Record<string, string>;
  return { linePriceCents, optionsByGroup };
}

/* ────────────────────────────────────────────────────────────
   SHIPPING ESTIMATE (POST /order/shippingEstimate)
   Accepts both option-ids array and options map, per docs.
──────────────────────────────────────────────────────────── */

export type EstimateItemIds = { productId: number; optionIds: (number | string)[] };
export type EstimateItemMap = { productId: number; options: Record<string, string> };
export type EstimateDest = { ShipCountry: "US" | "CA"; ShipState: string; ShipZip: string };

export type ShippingRate = {
  carrier: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: "USD" | "CAD";
  eta: string | null;
  days: number | null;
};

type EstimateRaw = {
  statusCode?: number;
  body?: [string, string, number | string, number | string | null][];
};

export async function estimateShipping(params: {
  items: (EstimateItemIds | EstimateItemMap)[];
  shippingInfo: EstimateDest;
  baseUrl?: string;
}): Promise<ShippingRate[]> {
  const { items, shippingInfo, baseUrl } = params;
  if (!items?.length) throw new Error("No shippable items.");

  const itemsPayload = items.map((it: any) =>
    Array.isArray(it.optionIds)
      ? { productId: Number(it.productId), options: it.optionIds.map((v: any) => String(v)) }
      : { productId: Number(it.productId), options: it.options }
  );

  const raw = await apiFetch<EstimateRaw>(`/order/shippingEstimate`, {
    method: "POST",
    body: JSON.stringify({ items: itemsPayload, shippingInfo }),
    baseUrl,
  });

  const currency: "USD" | "CAD" = shippingInfo.ShipCountry === "US" ? "USD" : "CAD";

  return (raw.body ?? []).map(([carrier, method, price, d]) => {
    const amt = Number(price);
    const days = Number(d);

    return {
      carrier: String(carrier),
      serviceCode: String(method),
      serviceName: String(method),
      amount: Number.isFinite(amt) ? amt : 0,
      currency,
      eta: Number.isFinite(days) ? `${days} business day${days === 1 ? "" : "s"}` : null,
      days: Number.isFinite(days) ? days : null,
    };
  });
}
