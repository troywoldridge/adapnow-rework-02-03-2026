// src/lib/sinalite.ts
import "server-only";

import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

/**
 * Sinalite REST client (server-only, TypeScript)
 * - Auth: Bearer access token from getSinaliteAccessToken() (per SinaLite API docs)
 * - Safe defaults for base URL
 * - Strong error reporting and request timeouts
 * - No Next.js caching surprises (cache: no-store)
 *
 * NOTE:
 * Prefer using src/lib/sinalite.server.ts as the single "canonical" server util.
 * Keep this file as a lightweight client wrapper for storefront endpoints only,
 * or migrate imports to sinalite.server.ts over time.
 */

// ---------- Minimal JSON type helpers ----------
export type JsonPrimitive = string | number | boolean | null;
export type Json = JsonPrimitive | Json[] | { [k: string]: Json };

// ---------- Base URL ----------
// IMPORTANT: Sinalite tenant bases vary. For your setup, you’ve been using api.sinaliteuppy.com.
// We keep env-first, then fall back to that.
const BASE: string = (
  process.env.SINALITE_API_BASE?.trim() ||
  process.env.SINALITE_BASE_URL?.trim() ||
  process.env.SINALITE_API_BASE_URL?.trim() ||
  "https://api.sinaliteuppy.com"
).replace(/\/+$/, "");

// ---------- Types for our local helpers ----------
type StoreCode = string;
type Path = string;

type ApiFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  baseUrl?: string;
};

// 10s default timeout for network protection
const DEFAULT_TIMEOUT_MS: number = Math.max(
  1_000,
  Number(process.env.SINALITE_HTTP_TIMEOUT_MS ?? 10_000)
);

function truncate(s: string, max = 1000) {
  const t = String(s ?? "");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

// Ensure we never call storefront endpoints without a store code
export function resolveStoreCode(input?: string | null): StoreCode {
  const envStore = process.env.NEXT_PUBLIC_STORE_CODE?.trim();
  const store = (input ?? envStore ?? "").trim();
  if (!store) {
    throw new Error("Missing storeCode. Pass it or set NEXT_PUBLIC_STORE_CODE in env.");
  }
  return store;
}

export function buildUrl(base: string, path: Path): string {
  const b = String(base ?? "").trim().replace(/\/+$/, "");
  const p = String(path ?? "").trim();
  const p2 = p.startsWith("/") ? p : `/${p}`;
  return `${b}${p2}`;
}

function withBearer(token: unknown): string {
  const t = String(token ?? "").trim();
  if (!t) {
    throw new Error("getSinaliteAccessToken() did not return a non-empty string.");
  }
  return /^Bearer\s/i.test(t) ? t : `Bearer ${t}`;
}

export class SinaliteClientError extends Error {
  status: number;
  url: string;
  body?: string;

  constructor(message: string, status: number, url: string, body?: string) {
    super(message);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

async function apiFetch<T = Json>(path: Path, init: ApiFetchOptions = {}): Promise<T | undefined> {
  const raw = await getSinaliteAccessToken();
  const authz = withBearer(raw);

  const baseUrl = (init.baseUrl ?? BASE).trim().replace(/\/+$/, "");
  const url = buildUrl(baseUrl, path);

  const controller = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(
    () => controller.abort(),
    DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: authz,
        ...(init.headers || {}),
      },
      cache: "no-store",
    } satisfies RequestInit);

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[sinalite] ${res.status} ${res.statusText} @ ${url}\n${truncate(text, 2000)}`
      );
      throw new SinaliteClientError(
        `Sinalite request failed: ${res.status} ${res.statusText}`,
        res.status,
        url,
        text
      );
    }

    if (!text || res.status === 204) return undefined;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new SinaliteClientError(
        `Sinalite returned non-JSON response.`,
        502,
        url,
        text
      );
    }
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name || "";
    if (name === "AbortError") {
      throw new Error(`Sinalite request timed out after ${DEFAULT_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/*==========================================================
=            Public convenience wrappers (TS)              =
==========================================================*/

// If you have official types from the SinaLite docs, replace `any` below
export async function getCategories<T = any>(storeCode?: string): Promise<T> {
  const sc = resolveStoreCode(storeCode);
  return (await apiFetch<T>(`/storefront/${encodeURIComponent(sc)}/categories`)) as T;
}

export async function getSubcategories<T = any>(
  storeCode: string | undefined,
  categoryId: string | number
): Promise<T> {
  const sc = resolveStoreCode(storeCode);
  const cid = encodeURIComponent(String(categoryId));
  return (await apiFetch<T>(
    `/storefront/${encodeURIComponent(sc)}/categories/${cid}/subcategories`
  )) as T;
}

export async function getProductDetails<T = any>(
  productId: string | number,
  storeCode?: string
): Promise<T> {
  const sc = resolveStoreCode(storeCode);
  const pid = encodeURIComponent(String(productId));
  return (await apiFetch<T>(`/storefront/${encodeURIComponent(sc)}/products/${pid}`)) as T;
}

export async function getProductOptions<T = any>(
  productId: string | number,
  storeCode?: string
): Promise<T> {
  const sc = resolveStoreCode(storeCode);
  const pid = encodeURIComponent(String(productId));
  return (await apiFetch<T>(`/storefront/${encodeURIComponent(sc)}/products/${pid}/options`)) as T;
}

export async function getProductPricingByHash<T = any>(
  productId: string | number,
  hash: string,
  storeCode?: string
): Promise<T> {
  const sc = resolveStoreCode(storeCode);
  const pid = encodeURIComponent(String(productId));
  const h = encodeURIComponent(hash);
  return (await apiFetch<T>(
    `/storefront/${encodeURIComponent(sc)}/products/${pid}/pricing?hash=${h}`
  )) as T;
}
