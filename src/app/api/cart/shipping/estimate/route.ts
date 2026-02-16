// src/app/api/cart/shipping/estimate/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  estimateShippingServer,
  type EstimateItem,
  type ShippingRate,
} from "@/lib/sinalite.pricing-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_LINES = 100;
const MAX_OPTION_IDS = 32;

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  // Edge runtime supports crypto.randomUUID(); Node runtime also supports it in modern Node.
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const BodySchema = z
  .object({
    country: z.enum(["US", "CA"]),
    state: z.string().trim().min(1).max(64),
    zip: z.string().trim().min(3).max(16),
    lines: z
      .array(
        z.object({
          productId: z.union([z.number(), z.string()]),
          optionIds: z.array(z.union([z.number(), z.string()])),
          quantity: z.union([z.number(), z.string()]).optional(),
        })
      )
      .default([]),
  })
  .strict();

function toFiniteInt(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n) : typeof n === "number" ? n : NaN;
  if (!Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function normalizeItems(lines: z.infer<typeof BodySchema>["lines"]): EstimateItem[] {
  const out: EstimateItem[] = [];

  for (const l of (lines || []).slice(0, MAX_LINES)) {
    const pid = toFiniteInt(l.productId);
    if (!pid || pid <= 0) continue;

    const optionIds = Array.isArray(l.optionIds)
      ? l.optionIds
          .slice(0, MAX_OPTION_IDS)
          .map(toFiniteInt)
          .filter((x): x is number => Number.isFinite(x as number))
          .filter((x) => x > 0)
      : [];

    const qRaw = l.quantity ?? 1;
    const q = toFiniteInt(qRaw);
    const quantity = Math.max(1, Math.min(100000, q ?? 1));

    out.push({ productId: pid, optionIds, quantity });
  }

  return out;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const json = await req.json().catch(() => null);

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid request body",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const body = parsed.data;
    const items = normalizeItems(body.lines);

    if (!items.length) {
      return NextResponse.json(
        { ok: true as const, requestId, rates: [] as ShippingRate[] },
        { status: 200, headers: { "x-request-id": requestId } }
      );
    }

    const rates = await estimateShippingServer(
      { country: body.country, state: body.state, zip: body.zip },
      items
    );

    return NextResponse.json(
      { ok: true as const, requestId, rates },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // Keep a stable envelope for clients.
    // Use 200 to preserve the old client behavior (it likely only checks ok/rates).
    // If you want stricter semantics later, switch this to status: 502.
    return NextResponse.json(
      {
        ok: false as const,
        requestId,
        error: message || "Shipping estimate failed",
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  }
}
