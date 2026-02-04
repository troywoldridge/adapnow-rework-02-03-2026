// src/app/cart/sinalite/price/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { priceSinaliteProduct } from "@/lib/sinalite.pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoreCode = "US" | "CA";

type PriceRequestBody = {
  productId: unknown;
  optionIds?: unknown;
  store?: unknown;
};

function normStore(v: unknown): StoreCode {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "CA" ? "CA" : "US";
}

function toInt(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  const m = Math.floor(n);
  if (m < 1) throw new Error(`${name} must be >= 1`);
  return m;
}

function toIntArray(v: unknown, maxLen = 24): number[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error("optionIds must be an array");

  // keep it sane: prevent accidental 10k option arrays
  if (v.length > maxLen) throw new Error(`optionIds too large (max ${maxLen})`);

  const out: number[] = [];
  for (const item of v) {
    const n = Number(item);
    if (!Number.isFinite(n)) continue;
    const m = Math.floor(n);
    if (m < 0) continue;
    out.push(m);
  }

  // optional: remove duplicates to keep pricing deterministic
  return Array.from(new Set(out));
}

function noStoreCacheHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

export async function POST(req: NextRequest) {
  const reqId =
    req.headers.get("x-request-id") ||
    `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    const body = (await req.json()) as PriceRequestBody;

    const productId = toInt(body?.productId, "productId");
    const optionIds = toIntArray(body?.optionIds);
    const store = normStore(body?.store);

    const priced = await priceSinaliteProduct({
      productId,
      optionIds,
      store,
    });

    // Guard against unexpected return values
    const unitPrice =
      typeof priced?.unitPrice === "number" && Number.isFinite(priced.unitPrice)
        ? priced.unitPrice
        : 0;

    return NextResponse.json(
      {
        ok: true,
        unitPrice,
        meta: priced?.pricingMeta ?? null,
        requestId: reqId,
      },
      { headers: noStoreCacheHeaders() },
    );
  } catch (e: unknown) {
    // Keep errors helpful but not leaky
    const message =
      e instanceof Error ? e.message : "Failed to price product";

    return NextResponse.json(
      {
        ok: false,
        error: message,
        requestId: reqId,
      },
      { status: 400, headers: noStoreCacheHeaders() },
    );
  }
}
