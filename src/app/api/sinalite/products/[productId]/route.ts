// src/app/api/sinalite/products/[productId]/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import {
  getSinaliteProductMeta,
  getSinaliteProductArrays as _getArrays,
} from "@/lib/sinalite.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/sinalite/products/:productId
 *
 * Query:
 *  - storeCode?: string        (defaults NEXT_PUBLIC_STORE_CODE or "en_us")
 *  - withArrays?: "1"|"true"   (include options/pricing arrays)
 *
 * Response:
 *  { ok:true, requestId, productId, storeCode, meta, options?, pricing? }
 *
 * Future-proofing:
 * - requestId header + stable envelope
 * - Zod validation for params/query
 * - no-store response (vendor data can change)
 * - arrays fetch is non-fatal; meta always returned when possible
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

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/, "productId must be numeric"),
});

const QuerySchema = z
  .object({
    storeCode: z.string().trim().max(40).optional(),
    withArrays: z.string().trim().optional(),
  })
  .strict();

function toBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const params = await ctx.params;
  const requestId = getRequestId(req);

  try {
    const p = ParamsSchema.safeParse(ctx.params);
    if (!p.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_productId",
          issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    const productIdNum = Number(p.data.productId);

    const url = new URL(req.url);
    const qp = QuerySchema.safeParse({
      storeCode: url.searchParams.get("storeCode") || undefined,
      withArrays: url.searchParams.get("withArrays") || undefined,
    });

    if (!qp.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_query",
          issues: qp.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    const storeCode = (
      qp.data.storeCode ||
      process.env.NEXT_PUBLIC_STORE_CODE ||
      "en_us"
    ).trim();

    const withArrays = toBool(qp.data.withArrays);

    // 1) Always fetch meta
    let meta: unknown = null;
    try {
      meta = await getSinaliteProductMeta(productIdNum);
    } catch (e: any) {
      // Upstream sometimes 404s with "Product Unavailable."
      return noStoreJson(
        req,
        { ok: false as const, requestId, error: String(e?.message || "Product not found") },
        404
      );
    }

    // 2) Optionally fetch arrays
    let options: any[] | undefined;
    let pricing: any[] | undefined;

    if (withArrays) {
      try {
        const { optionsArray, pricingArray, metaArray } = await _getArrays(productIdNum, storeCode);

        options = Array.isArray(optionsArray) ? optionsArray : [];
        pricing = Array.isArray(pricingArray) ? pricingArray : [];

        if (Array.isArray(metaArray) && metaArray.length > 0) {
          meta = metaArray[0];
        }
      } catch (e: any) {
        // non-fatal
        console.warn("[/api/sinalite/products/:id] arrays fetch failed:", e?.message || e);
      }
    }

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId: productIdNum,
      storeCode,
      meta,
      ...(withArrays ? { options, pricing } : {}),
    });
  } catch (err: any) {
    console.error("[/api/sinalite/products/:id] GET error:", err?.message || err);
    return noStoreJson(req, { ok: false as const, requestId, error: String(err?.message || err) }, 500);
  }
}

// Optional: a tiny HEAD so curl -I doesn’t 404 in dev
export async function HEAD() {
  return new NextResponse(null, { status: 204 });
}

async function methodNotAllowed(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
