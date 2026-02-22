// src/app/api/sinalite/price/[productId]/route.ts
import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredPrice } from "@/lib/sinalite.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NumOrStr = z.union([z.number(), z.string()]);
const NumOrStrArr = z.array(NumOrStr);
const NumOrStrRecord = z.record(z.string(), NumOrStr); // ✅ Zod v4 requires keyType + valueType

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function noStoreJson(req: NextRequest, body: unknown, status = 200) {
  const requestId = (body as any)?.requestId || getRequestId(req);
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
    optionIds: NumOrStrArr.optional(),
    productOptions: z.union([NumOrStrArr, NumOrStrRecord]).optional(),
    quantity: NumOrStr.optional(),
    store: z.union([z.literal("US"), z.literal("CA")]).optional(),
  })
  .passthrough();

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

function extractLineTotal(x: unknown): number | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;

  const picks = [
    o.lineTotal,
    o.total,
    o.price,
    o.unitPrice,
    o.price2 && typeof o.price2 === "object" ? (o.price2 as Record<string, unknown>).price : undefined,
  ].filter((v) => v !== undefined && v !== null);

  for (const v of picks) {
    const n =
      typeof v === "string"
        ? Number(v.replace(/[^\d.]/g, ""))
        : typeof v === "number"
          ? v
          : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return null;
}

function extractCurrency(x: unknown, store?: "US" | "CA"): "USD" | "CAD" {
  if (x && typeof x === "object") {
    const cur = (x as any).currency;
    if (cur === "CAD") return "CAD";
    if (cur === "USD") return "USD";
  }
  return store === "CA" ? "CAD" : "USD";
}

async function callConfiguredPrice(args: {
  productId: number;
  optionIds: number[];
  quantity: number;
  store?: "US" | "CA";
}): Promise<unknown> {
  const fn = getConfiguredPrice as unknown as (...a: any[]) => Promise<unknown>;

  try {
    return await fn({
      productId: args.productId,
      optionIds: args.optionIds,
      quantity: args.quantity,
      store: args.store,
    });
  } catch {
    return await fn(args.productId, args.optionIds, args.quantity, args.store);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const requestId = getRequestId(req);

  try {
    const rawParams = await ctx.params;
    const p = ParamsSchema.safeParse(rawParams);

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

    const productId = Number(p.data.productId);

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
          error: "optionIds_required",
          message: "Provide optionIds[] or productOptions (array/object of numeric values).",
        },
        400
      );
    }

    const quantity = toInt(body.quantity, 1, 1, 100000);
    const store =
      body.store === "US" || body.store === "CA" ? (body.store as "US" | "CA") : undefined;

    const priced = await callConfiguredPrice({ productId, optionIds, quantity, store });
    const lineTotal = extractLineTotal(priced);

    if (lineTotal == null) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_vendor_price" }, 502);
    }

    const currency = extractCurrency(priced, store);
    const unitPrice = lineTotal / Math.max(1, quantity);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId,
      optionIds,
      quantity,
      currency,
      lineTotal,
      unitPrice,
      lineTotalCents: Math.round(lineTotal * 100),
      unitPriceCents: Math.round(unitPrice * 100),
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