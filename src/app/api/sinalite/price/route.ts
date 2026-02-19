import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getConfiguredPrice } from "@/lib/sinalite.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BodySchema = z
  .object({
    productId: z.union([z.number(), z.string()]),
    optionIds: z.array(z.union([z.number(), z.string()])).optional(),
    productOptions: z.union([z.array(z.union([z.number(), z.string()])), z.record(z.union([z.number(), z.string()]))]).optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
    store: z.union([z.literal("US"), z.literal("CA")]).optional(),
  })
  .passthrough();

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

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function extractOptionIds(body: z.infer<typeof BodySchema>): number[] {
  const fromOptionIds = Array.isArray(body.optionIds) ? body.optionIds : null;
  const fromOptionsArray = Array.isArray(body.productOptions) ? body.productOptions : null;
  const fromOptionsObject =
    body.productOptions && typeof body.productOptions === "object" && !Array.isArray(body.productOptions)
      ? Object.values(body.productOptions)
      : null;

  const src = fromOptionIds ?? fromOptionsArray ?? fromOptionsObject ?? [];
  const out: number[] = [];
  const seen = new Set<number>();

  for (const candidate of src) {
    const n = typeof candidate === "string" ? Number(candidate) : typeof candidate === "number" ? candidate : NaN;
    if (!Number.isFinite(n)) continue;
    const id = Math.trunc(n);
    if (id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function extractLinePrice(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const node = raw as Record<string, unknown>;

  const values = [
    node.lineTotal,
    node.total,
    node.price,
    node.unitPrice,
    node.price2 && typeof node.price2 === "object" ? (node.price2 as Record<string, unknown>).price : undefined,
  ];

  for (const value of values) {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string"
        ? Number(value.replace(/[^\d.]/g, ""))
        : NaN;

    if (Number.isFinite(n) && n >= 0) return n;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json ?? {});

    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        400
      );
    }

    const body = parsed.data;
    const productId = toInt(body.productId, 0, 0, Number.MAX_SAFE_INTEGER);
    if (productId <= 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_productId" }, 400);
    }

    const optionIds = extractOptionIds(body);
    if (!optionIds.length) {
      return noStoreJson(req, { ok: false as const, requestId, error: "optionIds_required" }, 400);
    }

    const quantity = toInt(body.quantity, 1, 1, 100000);
    const priced = await getConfiguredPrice(productId, optionIds, quantity);
    const linePrice = extractLinePrice(priced);

    if (linePrice == null) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_vendor_price" }, 502);
    }

    const currency = body.store === "CA" ? "CAD" : "USD";
    const unitPrice = linePrice / Math.max(1, quantity);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId,
      quantity,
      optionIds,
      currency,
      linePrice,
      unitPrice,
      linePriceCents: Math.round(linePrice * 100),
      unitPriceCents: Math.round(unitPrice * 100),
      lineTotal: linePrice,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return noStoreJson(req, { ok: false as const, requestId, error: message || "server_error" }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method not allowed. Use POST." }, 405);
}
