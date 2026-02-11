// src/lib/cart-client.ts
"use client";

export type CartLineShape = Record<string, unknown>;

export type CartShape = {
  id: string | null;
  lines: CartLineShape[];
  subtotal: number;
  lineCount: number;
};

type CartApiResponse = {
  cart?: {
    id?: unknown;
    lines?: unknown;
    subtotal?: unknown;
    lineCount?: unknown;
  };
};

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

function toLines(v: unknown): CartLineShape[] {
  if (!Array.isArray(v)) return [];
  // Ensure each element is an object-ish shape
  return v.map((x) => (x && typeof x === "object" ? (x as CartLineShape) : ({} as CartLineShape)));
}

async function fetchJsonWithTimeout(url: string, ms = 6000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function normalizeCart(payload: unknown): CartShape {
  const j = (payload ?? {}) as CartApiResponse;
  const cart = (j.cart ?? {}) as NonNullable<CartApiResponse["cart"]>;

  const lines = toLines(cart.lines);
  const lineCount = toNumber(cart.lineCount, lines.length);

  return {
    id: toStringOrNull(cart.id),
    lines,
    subtotal: toNumber(cart.subtotal, 0),
    lineCount,
  };
}

/**
 * Client-side cart fetcher.
 * Tries /api/cart/current first (preferred), then falls back to /api/cart.
 * Always returns a stable shape.
 */
export async function getCart(): Promise<CartShape> {
  const endpoints = ["/api/cart/current", "/api/cart"] as const;

  for (const url of endpoints) {
    try {
      const r = await fetchJsonWithTimeout(url);
      if (!r.ok) continue;

      const json = (await r.json()) as unknown;
      return normalizeCart(json);
    } catch {
      // try next endpoint
    }
  }

  return { id: null, lines: [], subtotal: 0, lineCount: 0 };
}
