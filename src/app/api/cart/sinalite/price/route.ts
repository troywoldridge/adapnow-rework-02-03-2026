// src/app/api/cart/sinalite/price/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { getSinalitePriceRegular } from "@/lib/sinalite.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/cart/sinalite/price
 *
 * This is a cart-scoped pricing helper for quick client calls.
 * It intentionally returns a stable envelope while still passing through
 * vendor data under `raw` to avoid breaking existing UI.
 *
 * Body:
 * {
 *   productId: number|string,
 *   optionIds: (number|string)[]
 * }
 *
 * Response:
 * - Success: { ok:true, requestId, productId, optionIds, raw }
 * - Error:   { ok:false, requestId, error }
 *
 * Future-proofing:
 * - requestId header + no-store
 * - strict validation
 * - numeric coercion + de-dupe optionIds
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

function uniqPositiveInts(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of arr) {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    if (!Number.isFinite(n)) continue;
    const x = Math.trunc(n);
    if (x <= 0) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

const BodySchema = z
  .object({
    productId: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    optionIds: z.array(z.union([z.number(), z.string()])),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);

    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    const productId = parsed.data.productId;
    if (!Number.isFinite(productId) || productId <= 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_productId" }, 400);
    }

    const optionIds = uniqPositiveInts(parsed.data.optionIds);
    if (!optionIds.length) {
      return noStoreJson(req, { ok: false as const, requestId, error: "optionIds_required" }, 400);
    }

    const raw = await getSinalitePriceRegular(productId, optionIds);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId,
      optionIds,
      raw,
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Pricing failed");
    console.error("[/api/cart/sinalite/price POST] failed", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
