// src/app/api/products/[productId]/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  getSinaliteProductMeta,
  getSinaliteProductArrays as getArrays,
  estimateShipping,
} from "@/lib/sinalite.client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/products/[productId]
 *
 * Goals:
 * - Strict param + body validation (Zod).
 * - Stable response envelope with requestId.
 * - GET: returns product meta and optionally arrays (options/pricing) when requested.
 * - POST: (legacy helper) shipping estimate passthrough for ONE product. This remains optional.
 *
 * Notes:
 * - This is a Sinalite passthrough route. If you later cache products/options/pricing in DB,
 *   we can switch GET to "DB-first, upstream fallback".
 * - Uses server-only to prevent bundling on client.
 */

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function bad(req: NextRequest, status: number, msg: string, extra?: Record<string, unknown>) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    { ok: false as const, requestId, error: msg, ...(extra || {}) },
    { status, headers: { "x-request-id": requestId } }
  );
}

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/, "productId must be a numeric string"),
});

const GetQuerySchema = z.object({
  storeCode: z.string().trim().min(1).max(64).optional(),
  withArrays: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional(),
});

function parseWithArrays(v: string | null): boolean {
  return v === "1" || v === "true";
}

const PostBodySchema = z
  .object({
    optionIds: z.array(z.union([z.number(), z.string()])).min(1),
    shipCountry: z.enum(["US", "CA"]),
    shipState: z.string().trim().min(1).max(64),
    shipZip: z.string().trim().min(3).max(16),
    storeCode: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

function normalizeOptionIds(arr: Array<number | string>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of arr) {
    const n = typeof v === "string" ? Number(v) : v;
    if (!Number.isFinite(n)) continue;
    const id = Math.trunc(n);
    if (id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return Boolean(v);
}

export async function GET(req: NextRequest, ctx: { params: { productId: string } }) {
  const requestId = getRequestId(req);

  try {
    const p = ParamsSchema.safeParse(ctx.params);
    if (!p.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid productId",
          issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const url = new URL(req.url);
    const q = GetQuerySchema.safeParse({
      storeCode: url.searchParams.get("storeCode") || undefined,
      withArrays: url.searchParams.get("withArrays") || undefined,
    });

    if (!q.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid query",
          issues: q.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const productIdNum = Number(p.data.productId);
    const storeCode =
      (q.data.storeCode?.trim() ||
        process.env.NEXT_PUBLIC_STORE_CODE ||
        "en_us").trim();

    const withArrays = parseWithArrays(q.data.withArrays ?? null);

    // Always fetch meta
    let meta: unknown = null;
    try {
      meta = await getSinaliteProductMeta(productIdNum);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false as const, requestId, error: e?.message || "Product not found" },
        { status: 404, headers: { "x-request-id": requestId } }
      );
    }

    let options: any[] | undefined;
    let pricing: any[] | undefined;

    if (withArrays) {
      try {
        const { optionsArray, pricingArray, metaArray } = await getArrays(productIdNum, storeCode);
        options = Array.isArray(optionsArray) ? optionsArray : [];
        pricing = Array.isArray(pricingArray) ? pricingArray : [];
        if (Array.isArray(metaArray) && metaArray.length > 0) meta = metaArray[0];
      } catch (e: any) {
        // Non-fatal: meta still returns OK.
        console.warn("[/api/products/[productId]] arrays fetch failed:", e?.message || e);
      }
    }

    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId: productIdNum,
        storeCode,
        meta,
        ...(withArrays ? { options, pricing } : {}),
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: any) {
    console.error("[/api/products/[productId]] GET error:", err?.message || err);
    return NextResponse.json(
      { ok: false as const, requestId, error: err?.message || "Unknown error" },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: { productId: string } }) {
  const requestId = getRequestId(req);

  try {
    const p = ParamsSchema.safeParse(ctx.params);
    if (!p.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid productId",
          issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const productId = Number(p.data.productId);

    const raw = await req.json().catch(() => null);
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid request body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const optionIds = normalizeOptionIds(parsed.data.optionIds);
    if (!optionIds.length) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "optionIds[] is required" },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const storeCode =
      (parsed.data.storeCode?.trim() ||
        process.env.NEXT_PUBLIC_STORE_CODE ||
        "en_us").trim();

    const rawMethods = await estimateShipping({
      productId,
      optionIds,
      shipCountry: parsed.data.shipCountry,
      shipState: parsed.data.shipState,
      shipZip: parsed.data.shipZip,
      storeCode,
    });

    const methods = (rawMethods || []).map((r: any) => ({
      carrier: String(r.carrier ?? r[0] ?? ""),
      service: String(r.method ?? r.service ?? r[1] ?? ""),
      price: Number(r.price ?? r[2] ?? 0),
      available: toBool(r.available ?? 1),
    }));

    return NextResponse.json(
      { ok: true as const, requestId, productId, storeCode, methods },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: any) {
    console.error("[/api/products/[productId]] POST error:", err?.message || err);
    return NextResponse.json(
      { ok: false as const, requestId, error: err?.message || "Failed to process request" },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
