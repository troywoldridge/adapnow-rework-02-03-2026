// src/app/api/sinalite/price/[productId]/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { getConfiguredPrice } from "@/lib/sinalite.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/sinalite/price/:productId
 *
 * Accepts several legacy request shapes and returns normalized pricing:
 * { ok, requestId, productId, quantity, currency, lineTotal, unitPrice }
 *
 * Future-proofing:
 * - requestId header + stable response envelope
 * - Zod validation for params/body
 * - option id normalization across multiple payload shapes
 * - defensive vendor response parsing (unknown shape)
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

const BodySchema = z
  .object({
    // preferred
    optionIds: z.array(z.union([z.number(), z.string()])).optional(),
    // legacy array
    productOptions: z.union([z.array(z.union([z.number(), z.string()])), z.record(z.union([z.number(), z.string()]))]).optional(),
    // optional quantity
    quantity: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough(); // allow extra fields without breaking old clients

function toInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function normalizeOptionIdsFromBody(body: Record<string, unknown>): number[] {
  const fromOptionIds = Array.isArray(body.optionIds) ? (body.optionIds as unknown[]) : null;

  const productOptions = body.productOptions as unknown;

  const fromProductOptionsArray = Array.isArray(productOptions) ? (productOptions as unknown[]) : null;

  const fromProductOptionsObject =
    productOptions && typeof productOptions === "object" && !Array.isArray(productOptions)
      ? Object.values(productOptions as Record<string, unknown>)
      : null;

  const src = fromOptionIds || fromProductOptionsArray || fromProductOptionsObject || [];

  const out: number[] = [];
  const seen = new Set<number>();

  for (const v of src) {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    if (!Number.isFinite(n)) continue;
    const id = Math.trunc(n);
    if (id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

/** Safely pull a numeric total from any vendor shape */
function extractLineTotal(x: unknown): number | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;

  const picks = [
    o.lineTotal,
    o.total,
    o.price,
    o.unitPrice, // legacy stored TOTAL under "unitPrice"
    // sometimes nested { price2: { price } }
    o.price2 && typeof o.price2 === "object" ? (o.price2 as Record<string, unknown>).price : undefined,
  ].filter((v) => v !== undefined && v !== null);

  for (const v of picks) {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^\d.]/g, ""))
        : typeof v === "number"
        ? v
        : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

/** Try to read a currency code from the vendor shape; default USD safety */
function extractCurrency(x: unknown): "USD" | "CAD" {
  if (x && typeof x === "object") {
    const cur = (x as any).currency;
    if (cur === "CAD") return "CAD";
  }
  return "USD";
}

export async function POST(req: NextRequest, ctx: { params: { productId: string } }) {
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

    const pid = Number(p.data.productId);

    const json = await req.json().catch(() => null);
    const b = BodySchema.safeParse(json ?? {});
    if (!b.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: b.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    const body = (b.data ?? {}) as Record<string, unknown>;
    const optionIds = normalizeOptionIdsFromBody(body);

    if (optionIds.length === 0) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "optionIds[] required (array) or productOptions object/array with numeric values",
        },
        400
      );
    }

    const quantity = toInt(body.quantity, 1, 1, 100000);

    // Vendor/proxy helper returns unknown shape
    const priced: unknown = await getConfiguredPrice(pid, optionIds, quantity);

    const lineTotal = extractLineTotal(priced);
    if (!lineTotal) {
      return noStoreJson(
        req,
        { ok: false as const, requestId, error: "invalid_vendor_price" },
        502
      );
    }

    const currency = extractCurrency(priced);
    const unitPrice = lineTotal / Math.max(1, quantity);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId: pid,
      optionIds,
      quantity,
      currency,
      lineTotal,
      unitPrice,
      // Keep raw vendor reply off by default (can add ?debug=1 later)
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/sinalite/price/:productId POST]", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg || "server_error" }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
