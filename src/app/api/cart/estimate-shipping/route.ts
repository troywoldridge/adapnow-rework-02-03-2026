import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { estimateShippingServer, type EstimateItem } from "@/lib/sinalite.pricing-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BodySchema = z
  .object({
    shipCountry: z.enum(["US", "CA"]).optional(),
    shipState: z.string().trim().min(1).max(64).optional(),
    shipZip: z.string().trim().min(3).max(16).optional(),
    country: z.enum(["US", "CA"]).optional(),
    state: z.string().trim().min(1).max(64).optional(),
    zip: z.string().trim().min(3).max(16).optional(),
    items: z
      .array(
        z.object({
          productId: z.union([z.number(), z.string()]),
          optionIds: z.array(z.union([z.number(), z.string()])),
          quantity: z.union([z.number(), z.string()]).optional(),
        })
      )
      .optional(),
    lines: z
      .array(
        z.object({
          productId: z.union([z.number(), z.string()]),
          optionIds: z.array(z.union([z.number(), z.string()])),
          quantity: z.union([z.number(), z.string()]).optional(),
        })
      )
      .optional(),
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

function toInt(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toItems(rows: Array<{ productId: string | number; optionIds: Array<string | number>; quantity?: string | number }>): EstimateItem[] {
  const out: EstimateItem[] = [];

  for (const row of rows.slice(0, 100)) {
    const productId = toInt(row.productId);
    if (!productId || productId <= 0) continue;

    const optionIds = row.optionIds
      .slice(0, 32)
      .map(toInt)
      .filter((x): x is number => Number.isFinite(x as number) && (x as number) > 0);

    if (!optionIds.length) continue;

    const quantity = Math.max(1, Math.min(100000, toInt(row.quantity) ?? 1));
    out.push({ productId, optionIds, quantity });
  }

  return out;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid request body",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const body = parsed.data;
    const country = body.shipCountry ?? body.country;
    const state = body.shipState ?? body.state;
    const zip = body.shipZip ?? body.zip;
    const sourceItems = body.items ?? body.lines ?? [];

    if (!country || !state || !zip) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "shipCountry/shipState/shipZip (or country/state/zip) are required" },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const items = toItems(sourceItems);
    if (!items.length) {
      return NextResponse.json({ ok: true as const, requestId, rates: [] }, { headers: { "x-request-id": requestId } });
    }

    const rates = await estimateShippingServer({ country, state, zip }, items);

    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        rates: rates.map((rate) => ({
          carrier: rate.carrier,
          method: rate.serviceName || rate.serviceCode,
          cost: rate.amount,
          days: rate.days ?? null,
          currency: rate.currency,
          serviceCode: rate.serviceCode,
          serviceName: rate.serviceName,
          eta: rate.eta ?? null,
        })),
      },
      { headers: { "x-request-id": requestId } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false as const, requestId, error: message || "Shipping estimate failed" },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    { ok: false as const, requestId, error: "Method not allowed. Use POST." },
    { status: 405, headers: { "x-request-id": requestId } }
  );
}
