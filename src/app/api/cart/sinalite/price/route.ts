// src/app/api/cart/sinalite/price/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  priceSinaliteProduct,
  fetchSinaliteProductOptions,
  validateOnePerGroup,
} from "@/lib/sinalite";
import { withRequestId } from "@/lib/logger";
import { getRequestId } from "@/lib/requestId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoreLabel = "US" | "CA";

type PriceRequestBody = {
  productId: unknown;
  optionIds?: unknown;

  // prefer store, but allow currency too
  store?: unknown; // "US" | "CA"
  currency?: unknown; // "USD" | "CAD"

  // allow numeric storeCode too (9=US, 6=CA) if callers send it
  storeCode?: unknown;
};

function noStoreCacheHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function applyNoStore(res: NextResponse) {
  Object.entries(noStoreCacheHeaders()).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  const res = NextResponse.json(
    {
      ok: false as const,
      error: message,
      ...extra,
    },
    { status },
  );
  return applyNoStore(res);
}

function jsonOk(payload: Record<string, unknown>) {
  const res = NextResponse.json({ ok: true as const, ...payload }, { status: 200 });
  return applyNoStore(res);
}

function normStoreLabel(v: unknown, currency?: unknown, storeCode?: unknown): StoreLabel {
  const sc = Number(storeCode);
  if (Number.isFinite(sc)) {
    if (sc === 6) return "CA";
    if (sc === 9) return "US";
  }

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

function storeLabelToStoreCode(label: StoreLabel): number {
  // Common convention in your project: 9=US, 6=CA
  return label === "CA" ? 6 : 9;
}

export async function POST(req: NextRequest) {
  const reqId = getRequestId(req);
  const log = withRequestId(reqId);

  try {
    const body = (await req.json().catch(() => ({}))) as PriceRequestBody;

    const productId = toInt(body?.productId, "productId");
    const incomingOptionIds = toIntArray(body?.optionIds);

    if (incomingOptionIds.length === 0) {
      return jsonError(400, "optionIds required", {
        code: "optionIds_required",
        requestId: reqId,
      });
    }

    const storeLabel = normStoreLabel(body?.store, body?.currency, body?.storeCode);
    const store = storeLabel; // matches your Store union in lib types
    const storeCode = storeLabelToStoreCode(storeLabel);

    // 1) Load option definitions for this product/store
    // TS told us: fetchSinaliteProductOptions expects { productId, store, ttlMs? }
    // and returns SinaliteProductOption[] (not { productOptions: ... }).
    const productOptions = await fetchSinaliteProductOptions({ productId, store });

    if (!Array.isArray(productOptions) || productOptions.length === 0) {
      return jsonError(404, "No Sinalite options found for product/store", {
        code: "sinalite_no_options",
        productId,
        store,
        storeCode,
        requestId: reqId,
      });
    }

    // 2) Validate: one per group
    // TS told us validateOnePerGroup expects:
    // { optionIds: number[]; productOptions: SinaliteProductOption[]; excludeGroups?: string[] }
    let validation: any;
    try {
      validation = validateOnePerGroup({
        optionIds: incomingOptionIds,
        productOptions,
      });
    } catch (e: any) {
      const message = e instanceof Error ? e.message : "Invalid option selection";
      return jsonError(400, message, {
        code: "invalid_option_selection",
        productId,
        store,
        storeCode,
        incomingOptionIds,
        requestId: reqId,
      });
    }

    // normalize the chain field name (your TS errors showed normalizedOptionIds, not orderedChain)
    const normalizedOptionIds: number[] =
      (validation && (validation.normalizedOptionIds || validation.optionIds)) || incomingOptionIds;

    // 3) Price via API/local cache
    // TS told us priceSinaliteProduct expects { productId, optionIds, store } (NOT storeCode)
    const priced: any = await priceSinaliteProduct({
      productId,
      optionIds: normalizedOptionIds,
      store,
    });

    // Don’t assume shape (your TS errors showed PriceResult doesn't have "price"/"packageInfo"/"productOptions")
    // Return a stable envelope and include raw priced for now.
    return jsonOk({
      productId,
      store,
      storeCode,
      normalizedOptionIds,
      validation: {
        ok: validation?.ok ?? true,
        groupsUsed: validation?.groupsUsed ?? null,
        requiredGroups: validation?.requiredGroups ?? null,
      },
      priced,
      requestId: reqId,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to price product";
    const status =
      e instanceof Error && /must be a number|must be >= 1|optionIds|required/i.test(e.message)
        ? 400
        : 500;

    log.error("Sinalite price error", { message, requestId: reqId });

    return jsonError(status, message, {
      code: status === 400 ? "bad_request" : "sinalite_price_error",
      requestId: reqId,
    });
  }
}
