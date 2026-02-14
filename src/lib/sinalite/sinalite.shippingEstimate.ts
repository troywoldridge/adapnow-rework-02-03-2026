// src/lib/sinalite.shippingEstimate.ts
import "server-only";

import type {
  SinaliteShippingEstimateRequest,
  SinaliteShippingMethod,
} from "@/types/shipping";

function readFirst(keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = (process.env as Record<string, string | undefined>)[k];
    if (v && v.trim()) return v.trim();
  }
  return fallback;
}

// Sinalite endpoint (POST)
const API_URL =
  readFirst(
    [
      "SINALITE_SHIPPING_ESTIMATE_URL",
      "SINALITE_API_SHIPPING_ESTIMATE_URL",
      "SINALITE_API_BASE_URL", // legacy in your snippet
    ],
    "",
  ) || "https://liveapi.sinalite.com/order/shippingEstimate";

function normalizeToken(accessToken: string): string {
  const t = String(accessToken ?? "").trim();
  if (!t) return "";
  // Support either "Bearer xxx" or raw token
  return /^bearer\s+/i.test(t) ? t : `Bearer ${t}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

type TupleRow = [string, string, number, number];
type ObjectRow = {
  carrier?: unknown;
  service?: unknown;
  price?: unknown;
  available?: unknown;
  isAvailable?: unknown;
};

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function toStr(v: unknown): string {
  return String(v ?? "").trim();
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const n = toNum(v, NaN);
  if (Number.isFinite(n)) return n !== 0;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "true" || s === "yes" || s === "y";
}

function mapRow(row: unknown): SinaliteShippingMethod | null {
  // Tuple format: [carrier, service, price, available]
  if (Array.isArray(row) && row.length >= 4) {
    const t = row as TupleRow;
    const carrier = toStr(t[0]);
    const service = toStr(t[1]);
    const price = toNum(t[2], 0);
    const available = toBool(t[3]);
    if (!carrier && !service) return null;
    return { carrier, service, price, available };
  }

  // Object format: { carrier, service, price, available }
  if (row && typeof row === "object") {
    const o = row as ObjectRow;
    const carrier = toStr(o.carrier);
    const service = toStr(o.service);
    const price = toNum(o.price, 0);
    const available = toBool(o.available ?? o.isAvailable);
    if (!carrier && !service) return null;
    return { carrier, service, price, available };
  }

  return null;
}

function extractRows(json: any): unknown[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  // Common wrappers
  if (Array.isArray(json.body)) return json.body;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.result)) return json.result;

  // Sometimes APIs return { body: { data: [...] } }
  if (json.body && Array.isArray(json.body.data)) return json.body.data;

  return [];
}

/**
 * Fetch Sinalite shipping methods.
 * Returns normalized array: { carrier, service, price, available }
 */
export async function getShippingEstimate(
  orderData: SinaliteShippingEstimateRequest,
  accessToken: string,
): Promise<SinaliteShippingMethod[]> {
  const token = normalizeToken(accessToken);
  if (!token) throw new Error("Shipping estimate failed: missing access token");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(orderData ?? {}),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await safeReadText(res);
    const snippet = text ? ` :: ${text.slice(0, 400)}` : "";
    throw new Error(`Shipping estimate failed (${res.status} ${res.statusText})${snippet}`);
  }

  const json = await res.json().catch(() => null);
  const rows = extractRows(json);

  if (!rows.length) {
    throw new Error("Shipping estimate: malformed response (no rows)");
  }

  const out: SinaliteShippingMethod[] = [];
  for (const r of rows) {
    const mapped = mapRow(r);
    if (mapped) out.push(mapped);
  }

  return out;
}
