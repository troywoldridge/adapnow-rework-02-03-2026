// src/app/api/price/pricing/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { computePrice } from "@/lib/price/compute";
import type { Store } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  productId?: number | string;
  store?: Store | string; // "US" | "CA" (accept unknown string, normalize)
  quantity?: number | string;
  optionIds?: Array<number | string>;
  categoryId?: number | string | null;
  subcategoryId?: number | string | null;
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function toInt(v: unknown, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function toNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeStore(v: unknown): Store {
  return String(v ?? "")
    .trim()
    .toUpperCase() === "CA"
    ? "CA"
    : "US";
}

function normalizeOptionIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of v) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.trunc(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const productId = toInt(body?.productId, 0);
    const store = normalizeStore(body?.store);
    const quantity = Math.max(1, toInt(body?.quantity ?? 1, 1));

    const optionIds = normalizeOptionIds(body?.optionIds);

    const categoryId = toNullableInt(body?.categoryId);
    const subcategoryId = toNullableInt(body?.subcategoryId);

    if (!productId) {
      return noStoreJson({ ok: false, error: "invalid_productId" }, 400);
    }
    if (optionIds.length === 0) {
      return noStoreJson({ ok: false, error: "missing_optionIds" }, 400);
    }

    const result = await computePrice({
      productId,
      store,
      quantity,
      optionIds,
      categoryId,
      subcategoryId,
    });

    // computePrice should return a stable shape; just force no-store at the edge.
    return noStoreJson(result, 200);
  } catch (err: any) {
    console.error("[/api/price/pricing] POST error:", err?.message || err);
    return noStoreJson({ ok: false, error: String(err?.message || "pricing_failed") }, 500);
  }
}

// Optional method guards (nice for debugging)
export async function GET() {
  return noStoreJson({ ok: false, error: "Method Not Allowed" }, 405);
}
export const PUT = GET;
export const DELETE = GET;
