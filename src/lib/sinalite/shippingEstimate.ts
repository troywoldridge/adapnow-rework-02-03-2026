// src/lib/sinalite/shippingEstimate.ts
import "server-only";

import type {
  SinaliteShippingEstimateRequest,
  SinaliteShippingMethod,
} from "@/types/shipping";

/**
 * Sinalite Shipping Estimate
 *
 * Env:
 * - SINALITE_API_BASE_URL (optional)
 *   Defaults to the live endpoint:
 *   https://liveapi.sinalite.com/order/shippingEstimate
 *
 * Notes:
 * - Authorization header format varies by integration style. This helper:
 *   - uses the token as-is if it already contains a space (e.g. "Bearer xxx")
 *   - otherwise prefixes "Bearer " (common pattern)
 * - Uses AbortController for a hard timeout.
 */

const DEFAULT_URL = "https://liveapi.sinalite.com/order/shippingEstimate";

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n !== 0;
  const str = s(v).toLowerCase();
  return str === "true" || str === "1" || str === "yes" || str === "on";
}

function makeAuthHeader(accessToken: string): string {
  const tok = s(accessToken);
  if (!tok) return "";
  // If it already looks like "Bearer xxx" or "Basic xxx", keep it
  if (tok.includes(" ")) return tok;
  // Default to Bearer
  return `Bearer ${tok}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeReadJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function getShippingEstimate(
  orderData: SinaliteShippingEstimateRequest,
  accessToken: string,
  opts?: {
    url?: string;
    timeoutMs?: number;
  },
): Promise<SinaliteShippingMethod[]> {
  const url = s(opts?.url) || s(process.env.SINALITE_API_BASE_URL) || DEFAULT_URL;
  const timeoutMs = Math.max(1_000, Math.min(60_000, Number(opts?.timeoutMs ?? 20_000)));

  const authHeader = makeAuthHeader(accessToken);
  if (!authHeader) {
    throw new Error("Shipping estimate failed: missing access token");
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(orderData),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? `Shipping estimate failed: request timed out after ${timeoutMs}ms`
        : "Shipping estimate failed: network error";
    throw new Error(msg);
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await safeReadText(res);
    const snippet = s(text).slice(0, 800);
    throw new Error(
      `Shipping estimate failed: HTTP ${res.status} ${res.statusText}${
        snippet ? ` — ${snippet}` : ""
      }`,
    );
  }

  const json = await safeReadJson(res);

  // Sinalite often returns { body: [...] }, but be defensive.
  const body = json?.body ?? json?.data ?? json;

  if (!Array.isArray(body)) {
    throw new Error("Shipping estimate: Malformed response (expected array body)");
  }

  // Expected row shape: [carrier, service, price, available]
  // We coerce lightly to avoid runtime crashes.
  return body
    .map((row: any): SinaliteShippingMethod | null => {
      if (!Array.isArray(row) || row.length < 4) return null;

      const carrier = s(row[0]);
      const service = s(row[1]);
      const price = toNumber(row[2], 0);
      const available = toBool(row[3]);

      if (!carrier || !service) return null;

      return { carrier, service, price, available };
    })
    .filter((x: SinaliteShippingMethod | null): x is SinaliteShippingMethod => !!x);
}
