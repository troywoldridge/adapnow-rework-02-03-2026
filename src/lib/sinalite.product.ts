// src/lib/sinalite.product.ts
import "server-only";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";

const BASE = (process.env.SINALITE_BASE_URL ?? "https://liveapi.sinalite.com").replace(/\/+$/, "");

type Store = "US" | "CA";
type StoreCode = "en_us" | "en_ca";

export type SinaliteProductOption = {
  id: number;
  group: string;
  name: string;
};

type CacheEntry = {
  expiresAt: number;
  options: SinaliteProductOption[];
};

const cache = new Map<string, CacheEntry>();

function storeToStoreCode(store: Store): StoreCode {
  return store === "CA" ? "en_ca" : "en_us";
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

/**
 * OPTIONAL DB SOURCE (DB-first):
 * If you later sync Sinalite options into a table, set:
 *   SINALITE_OPTIONS_TABLE=options
 * and ensure the table has columns:
 *   product_id (int), option_id (int), "group" (text), name (text)
 *
 * If the table doesn't exist or returns no rows, we fallback to SinaLite API.
 */
async function tryLoadOptionsFromDb(args: {
  productId: number;
}): Promise<SinaliteProductOption[] | null> {
  const table = (process.env.SINALITE_OPTIONS_TABLE ?? "").trim();
  if (!table) return null;

  // Use a safe identifier build by restricting allowed names (no injection).
  // Only allow simple [a-zA-Z0-9_]
  if (!/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error("Invalid SINALITE_OPTIONS_TABLE (must be alphanumeric/underscore)");
  }

  try {
    // NOTE: this assumes your future sync uses these column names.
    // If your real table differs, just adjust this one query later.
    const q = sql`
      select
        option_id as id,
        "group" as "group",
        name as name
      from ${sql.identifier(table)}
      where product_id = ${args.productId}
    `;

    const res = await db.execute(q);
    const rows = (res as any)?.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) return null;

    const out: SinaliteProductOption[] = [];
    for (const r of rows) {
      const id = toInt(r?.id);
      const group = norm(r?.group);
      const name = norm(r?.name);
      if (id < 1 || !group) continue;
      out.push({ id, group, name });
    }

    return out.length ? out : null;
  } catch {
    // Table doesn't exist yet / db empty / query fails → treat as "not ready"
    return null;
  }
}

async function fetchOptionsFromSinalite(args: {
  productId: number;
  store: Store;
}): Promise<SinaliteProductOption[]> {
  const productId = toInt(args.productId);
  if (productId < 1) throw new Error("productId must be >= 1");

  const store = args.store === "CA" ? "CA" : "US";
  const storeCode = storeToStoreCode(store);

  const token = await getSinaliteAccessToken();
  const url = `${BASE}/product/${productId}/${storeCode}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      authorization: token,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SinaLite product fetch failed: ${res.status} ${res.statusText} ${txt}`.trim());
  }

  const data = (await res.json().catch(() => null)) as any;

  // SinaLite docs: response consists of 3 arrays; first is options array.
  const rawOptions = Array.isArray(data?.[0]) ? data[0] : Array.isArray(data?.options) ? data.options : null;
  if (!Array.isArray(rawOptions)) {
    throw new Error("SinaLite product response missing options array");
  }

  const out: SinaliteProductOption[] = [];
  for (const r of rawOptions) {
    const id = toInt(r?.id);
    const group = norm(r?.group);
    const name = norm(r?.name);
    if (id < 1 || !group) continue;
    out.push({ id, group, name });
  }

  return out;
}

/**
 * Fetch product options for validation:
 * - DB-first if configured AND populated
 * - SinaLite fallback otherwise
 * Cached briefly to reduce repeated calls.
 */
export async function fetchSinaliteProductOptions(args: {
  productId: number;
  store: Store;
  ttlMs?: number;
}): Promise<SinaliteProductOption[]> {
  const productId = toInt(args.productId);
  if (productId < 1) throw new Error("productId must be >= 1");

  const store = args.store === "CA" ? "CA" : "US";
  const storeCode = storeToStoreCode(store);

  const now = Date.now();
  const ttlMs = Number.isFinite(args.ttlMs as number) ? (args.ttlMs as number) : 5 * 60_000;

  const cacheKey = `${productId}:${storeCode}`;
  const hit = cache.get(cacheKey);
  if (hit && now < hit.expiresAt) return hit.options;

  // ✅ DB-first (if configured and populated)
  const dbOpts = await tryLoadOptionsFromDb({ productId });
  if (dbOpts && dbOpts.length) {
    cache.set(cacheKey, { expiresAt: now + ttlMs, options: dbOpts });
    return dbOpts;
  }

  // ✅ Fallback to SinaLite
  const apiOpts = await fetchOptionsFromSinalite({ productId, store });
  cache.set(cacheKey, { expiresAt: now + ttlMs, options: apiOpts });
  return apiOpts;
}
