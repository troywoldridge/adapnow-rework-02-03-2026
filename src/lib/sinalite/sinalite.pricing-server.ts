// src/lib/sinalite.pricing-server.ts
import "server-only";

import { getSinaliteBearer } from "@/lib/sinalite/sinalite.server";

const API_BASE =
  (process.env.SINALITE_API_BASE ??
    process.env.SINALITE_BASE_URL ??
    "https://api.sinaliteuppy.com")
    .trim()
    .replace(/\/+$/, "");

export type EstimateItem = {
  productId: number;
  optionIds: number[];
  quantity?: number;
};

export type EstimateDest = {
  country: "US" | "CA";
  state: string;
  zip: string;
};

export type ShippingRate = {
  carrier: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: "USD" | "CAD";
  eta?: string | null;
  days?: number | null;
};

export class SinaliteEstimateError extends Error {
  status: number;
  body?: string;

  constructor(message: string, status: number, body?: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function normToken(token: string): string {
  const t = String(token ?? "").trim();
  if (!t) return "";
  return t.toLowerCase().startsWith("bearer ") ? t : `Bearer ${t}`;
}

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function truncate(s: string, max = 500): string {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function estimateShippingServer(
  dest: EstimateDest,
  items: EstimateItem[]
): Promise<ShippingRate[]> {
  if (!dest || !dest.country || !dest.state || !dest.zip) return [];
  if (!Array.isArray(items) || items.length === 0) return [];

  const token = normToken(await getSinaliteBearer());
  if (!token) {
    throw new Error("Missing Sinalite bearer token (getSinaliteBearer returned empty).");
  }

  const payload = {
    items: items.map((it) => ({
      productId: Number(it.productId),
      // Sinalite historically accepts option IDs as strings OR numbers; upstream seems tolerant.
      options: (it.optionIds || [])
        .map((x) => String(Number(x)))
        .filter((x) => x !== "NaN"),
      ...(toNum(it.quantity) != null ? { quantity: Number(it.quantity) } : {}),
    })),
    shippingInfo: {
      ShipCountry: dest.country,
      ShipState: String(dest.state).trim(),
      ShipZip: String(dest.zip).trim(),
    },
  };

  const url = `${API_BASE}/order/shippingEstimate`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: token,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    throw new SinaliteEstimateError(
      `SinaLite estimate failed: ${res.status} ${res.statusText} @ ${url} – ${truncate(text, 300)}`,
      res.status,
      text
    );
  }

  const json = safeJsonParse<{
    statusCode?: number;
    body?: [string, string, number | string, number | string | null][];
  }>(text);

  const currency: "USD" | "CAD" = dest.country === "US" ? "USD" : "CAD";

  const rows: [string, string, number | string, number | string | null][] =
    Array.isArray(json?.body) ? json!.body : [];

  return rows.map(([carrier, method, price, days]) => {
    const nDays = toNum(days);
    const nPrice = toNum(price) ?? 0;

    return {
      carrier: String(carrier),
      serviceCode: String(method),
      serviceName: String(method),
      amount: nPrice,
      currency,
      eta: nDays == null ? null : `${nDays} business day${nDays === 1 ? "" : "s"}`,
      days: nDays,
    };
  });
}
