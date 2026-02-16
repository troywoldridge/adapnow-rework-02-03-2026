// src/app/api/sinalite/price/batch/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

/**
 * POST /api/sinalite/price/batch
 *
 * Body:
 * {
 *   items: Array<{
 *     productId: number
 *     optionIds: number[]
 *     quantity?: number
 *     shipCountry?: "US" | "CA"   (optional; forwarded to single-price route)
 *     shipState?: string
 *     shipZip?: string
 *     storeCode?: number
 *   }>
 * }
 *
 * Returns:
 * {
 *   ok: true,
 *   requestId,
 *   results: Array<{
 *     productId,
 *     ok: boolean,
 *     unitPrice?: number,
 *     lineTotal?: number,
 *     currency?: "USD"|"CAD",
 *     error?: string
 *   }>
 * }
 *
 * Future-proof upgrades:
 * - requestId header + envelope
 * - Zod validation and normalization
 * - Avoids calling the app via absolute origin/headers (no SSR host/proto issues)
 *   -> Calls your pricing helper directly (same as /api/sinalite/price/[productId]).
 * - Concurrency limiting to prevent stampedes
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function toInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
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

/** Safely pull a numeric total from any vendor shape */
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

function extractCurrency(x: unknown): "USD" | "CAD" {
  if (x && typeof x === "object") {
    const cur = (x as any).currency;
    if (cur === "CAD") return "CAD";
  }
  return "USD";
}

// IMPORTANT: We call your helper directly (same one used by /api/sinalite/price/[productId])
import { getConfiguredPrice } from "@/lib/sinalite.client";

const BatchItemSchema = z.object({
  productId: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  optionIds: z.array(z.union([z.number(), z.string()])),
  quantity: z.union([z.number(), z.string()]).optional(),
  shipCountry: z.union([z.literal("US"), z.literal("CA")]).optional(),
  shipState: z.string().optional(),
  shipZip: z.string().optional(),
  storeCode: z.union([z.number(), z.string()]).optional().transform((v) => (v == null ? undefined : Number(v))),
});

const BodySchema = z
  .object({
    items: z.array(BatchItemSchema).min(1).max(200),
  })
  .strict();

/** simple concurrency limiter */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length) as any;
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }

  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

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

    const items = parsed.data.items.map((it) => {
      const pid = Number(it.productId);
      const optionIds = uniqPositiveInts(it.optionIds);
      const quantity = toInt(it.quantity, 1, 1, 100000);

      // storeCode: default per your notes; keep optional and pass through to vendor helper only if it supports it.
      // getConfiguredPrice(pid, optionIds, quantity) currently doesn't take storeCode, so we just keep it in case.
      // If you later expand getConfiguredPrice, update here too.
      const shipCountry = it.shipCountry; // optional

      return {
        productId: pid,
        optionIds,
        quantity,
        shipCountry,
        shipState: it.shipState || "",
        shipZip: it.shipZip || "",
        storeCode: typeof it.storeCode === "number" && Number.isFinite(it.storeCode) ? it.storeCode : undefined,
      };
    });

    // Validate normalized
    for (const it of items) {
      if (!Number.isFinite(it.productId) || it.productId <= 0) {
        return noStoreJson(req, { ok: false as const, requestId, error: "invalid_productId" }, 400);
      }
      if (!it.optionIds.length) {
        return noStoreJson(req, { ok: false as const, requestId, error: "optionIds_required" }, 400);
      }
    }

    const concurrency = toInt(process.env.SINALITE_BATCH_CONCURRENCY, 6, 1, 20);

    const results = await mapLimit(items, concurrency, async (it) => {
      try {
        const priced: unknown = await getConfiguredPrice(it.productId, it.optionIds, it.quantity);

        const lineTotal = extractLineTotal(priced);
        if (lineTotal == null) {
          return { productId: it.productId, ok: false as const, error: "invalid_vendor_price" };
        }

        const currency = extractCurrency(priced);
        const unitPrice = lineTotal / Math.max(1, it.quantity);

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          return { productId: it.productId, ok: false as const, error: "invalid_unit_price" };
        }

        return {
          productId: it.productId,
          ok: true as const,
          currency,
          unitPrice,
          lineTotal,
          quantity: it.quantity,
        };
      } catch (e: any) {
        return { productId: it.productId, ok: false as const, error: String(e?.message || e) };
      }
    });

    return noStoreJson(req, { ok: true as const, requestId, results }, 200);
  } catch (e: any) {
    console.error("[/api/sinalite/price/batch POST] failed", e);
    return noStoreJson(req, { ok: false as const, requestId, error: String(e?.message || e) }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
