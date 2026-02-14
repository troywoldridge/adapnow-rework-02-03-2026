// src/app/api/cart/sinalite/price/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  priceSinaliteProduct,
  fetchSinaliteProductOptions,
  validateOnePerGroup,
  normalizeStoreCode,
  storeCodeToStoreLabel,
} from "@/lib/sinalite";
import { jsonError, getRequestId } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";

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
};

function noStoreCacheHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function normStoreLabel(v: unknown, currency?: unknown): StoreLabel {
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

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function applyNoStore(res: NextResponse) {
  Object.entries(noStoreCacheHeaders()).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function POST(req: NextRequest) {
  const reqId = getRequestId(req);
  const log = withRequestId(reqId);

  try {
    const body = (await req.json().catch(() => ({}))) as PriceRequestBody;

    const productId = toInt(body?.productId, "productId");
    const incomingOptionIds = toIntArray(body?.optionIds);

    if (incomingOptionIds.length === 0) {
      return applyNoStore(
        jsonError(400, "optionIds required", {
          code: "optionIds_required",
          requestId: reqId,
        }),
      );
    }

    const storeLabel = normStoreLabel(body?.store, body?.currency);
    const storeCode = normalizeStoreCode(storeLabel); // -> "en_us" | "en_ca"

    // 1) Load option definitions for this product/store
    const details = await fetchSinaliteProductOptions({ productId, storeCode });
    const productOptions = details.productOptions;

    if (!productOptions.length) {
      // jsonError can't accept productId/storeCode extra fields (typed), so return a custom JSON.
      const res = NextResponse.json(
        {
          ok: false as const,
          error: "No Sinalite options found for product/store",
          code: "sinalite_no_options",
          productId,
          storeCode,
          store: storeCodeToStoreLabel(storeCode),
          requestId: reqId,
        },
        { status: 404 },
      );
      return applyNoStore(res);
    }

    // 2) Validate: one per group (throws on problems)
    let validation: ReturnType<typeof validateOnePerGroup>;
    try {
      validation = validateOnePerGroup({
        productId,
        storeCode,
        productOptions,
        selectedOptionIds: incomingOptionIds,
      });
    } catch (e: any) {
      const message = e instanceof Error ? e.message : "Invalid option selection";
      const res = NextResponse.json(
        {
          ok: false as const,
          error: message,
          code: "invalid_option_selection",
          productId,
          storeCode,
          store: storeCodeToStoreLabel(storeCode),
          incomingOptionIds,
          requestId: reqId,
        },
        { status: 400 },
      );
      return applyNoStore(res);
    }

    // 3) Price via API: POST /price/{id}/{storeId}
    const priced = await priceSinaliteProduct({
      productId,
      storeCode,
      optionIds: validation.orderedChain,
    });

    const unitPrice = toNumberOrNull(priced.price);

    const res = NextResponse.json(
      {
        ok: true as const,
        productId,
        store: storeCodeToStoreLabel(storeCode),
        storeCode,

        // numeric if possible + original string price
        unitPrice,
        price: priced.price,

        packageInfo: priced.packageInfo ?? null,
        // product option labels returned by Sinalite /price endpoint
        productOptions: priced.productOptions ?? null,

        // chain info
        normalizedOptionIds: validation.orderedChain,
        variantKey: validation.variantKey,
        selections: validation.selections,

        requestId: reqId,
      },
      { status: 200 },
    );
    return applyNoStore(res);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to price product";
    const status =
      e instanceof Error && /must be a number|must be >= 1|optionIds|required/i.test(e.message)
        ? 400
        : 500;

    log.error("Sinalite price error", { message, requestId: reqId });

    return applyNoStore(
      jsonError(status, message, {
        requestId: reqId,
      }),
    );
  }
}
