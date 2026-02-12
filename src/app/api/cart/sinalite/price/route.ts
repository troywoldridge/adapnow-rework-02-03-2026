// src/app/api/cart/sinalite/price/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  priceSinaliteProduct,
  fetchSinaliteProductOptions,
  validateOnePerGroup,
} from "@/lib/sinalite";
import { jsonError, getRequestId } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoreCode = "US" | "CA";

type PriceRequestBody = {
  productId: unknown;
  optionIds?: unknown;

  // prefer store, but allow currency too
  store?: unknown;
  currency?: unknown;
};

function noStoreCacheHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function normStore(v: unknown, currency?: unknown): StoreCode {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "CA") return "CA";
  if (s === "US") return "US";

  const c = String(currency ?? "").trim().toUpperCase();
  if (c === "CAD") return "CA";
  return "US";
}

function toInt(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  const m = Math.floor(n);
  if (m < 1) throw new Error(`${name} must be >= 1`);
  return m;
}

function toIntArray(v: unknown, maxLen = 64): number[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error("optionIds must be an array");
  if (v.length > maxLen) throw new Error(`optionIds too large (max ${maxLen})`);

  const out: number[] = [];
  for (const item of v) {
    const n = Number(item);
    if (!Number.isFinite(n)) continue;
    const m = Math.floor(n);
    if (m < 1) continue;
    out.push(m);
  }
  return Array.from(new Set(out));
}

export async function POST(req: NextRequest) {
  const reqId = getRequestId(req);
  const log = withRequestId(reqId);

  try {
    const body = (await req.json().catch(() => ({}))) as PriceRequestBody;

    const productId = toInt(body?.productId, "productId");
    const incomingOptionIds = toIntArray(body?.optionIds);

    if (incomingOptionIds.length === 0) {
      const res = jsonError(400, "optionIds required", { code: "optionIds_required", requestId: reqId });
      Object.entries(noStoreCacheHeaders()).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const store = normStore(body?.store, body?.currency);

    // ✅ Load option definitions from SinaLite and validate "1 per group"
    const productOptions = await fetchSinaliteProductOptions({ productId, store });

    const validation = validateOnePerGroup({
      optionIds: incomingOptionIds,
      productOptions,
      // excludeGroups: ["someGroup"] // keep hook for later
    });

    if (!validation.ok) {
      const body = {
        ok: false as const,
        error: validation.error,
        details: {
          requiredGroups: validation.requiredGroups,
          unknownOptionIds: validation.unknownOptionIds ?? null,
          missingGroups: validation.missingGroups ?? null,
          duplicateGroups: validation.duplicateGroups ?? null,
        },
        requestId: reqId,
      };
      const res = NextResponse.json(body, { status: 400, headers: noStoreCacheHeaders() });
      return res;
    }

    // ✅ normalizedOptionIds is now exactly one per required group
    const priced = await priceSinaliteProduct({
      productId,
      optionIds: validation.normalizedOptionIds,
      store,
    });

    const unitPrice =
      typeof priced?.unitPrice === "number" && Number.isFinite(priced.unitPrice)
        ? priced.unitPrice
        : 0;

    return NextResponse.json(
      {
        ok: true,
        unitPrice,
        meta: priced?.pricingMeta ?? null,
        normalizedOptionIds: validation.normalizedOptionIds,
        groupsUsed: validation.groupsUsed,
        requestId: reqId,
      },
      { headers: noStoreCacheHeaders() },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to price product";
    const status = e instanceof Error && /must be a number|must be >= 1|optionIds|required/i.test(e.message) ? 400 : 500;
    log.error("Sinalite price error", { message });
    const res = jsonError(status, message, { requestId: reqId });
    Object.entries(noStoreCacheHeaders()).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}
