// src/lib/sinalite.pricing.ts
import "server-only";

import { getEnv } from "@/lib/env";
import { getSinaliteAccessToken } from "@/lib/getSinaliteAccessToken";
import { optionIdsToSinaOptions } from "@/lib/sinaliteOptionMap";
import {
  currencyToStoreCode,
  storeToCurrency,
  type Store,
  type Currency,
} from "@/lib/storeCodes";
import {
  getSinaliteProductArrays,
  normalizeOptionGroups,
} from "@/lib/sinalite.client";

function getBase(): string {
  return getEnv().SINALITE_BASE_URL || "https://liveapi.sinalite.com";
}

export type PriceResult = {
  unitPrice: number; // dollars
  pricingMeta: {
    productOptions?: Record<string, string>;
    packageInfo?: unknown;
    // keep raw optional but trimmed; large payloads can bloat logs/DB
    raw?: unknown;
  };
};

type SinaPriceResponse = {
  price?: unknown;
  productOptions?: unknown;
  packageInfo?: unknown;
  response?: {
    price?: unknown;
    productOptions?: unknown;
    packageInfo?: unknown;
  };
  price2?: { price?: unknown };
};

function normKey(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isQtyKey(k: unknown) {
  const s = normKey(k);
  return s === "qty" || s === "quantity";
}

function toInt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const m = Math.floor(n);
  return m > 0 ? m : null;
}

function pickFirstOptionId(group: any): number | null {
  const values: any[] =
    group?.options ||
    group?.values ||
    group?.items ||
    group?.choices ||
    group?.children ||
    [];

  const first = values?.[0];
  if (!first) return null;

  return (
    toInt(first?.id) ??
    toInt(first?.valueId) ??
    toInt(first?.optionId) ??
    toInt(first?.value) ??
    toInt(first?.code)
  );
}

function findQtyGroup(groups: any[]): any | null {
  // Try common keys in order of likelihood
  for (const g of groups) {
    const candidates = [
      g?.name,
      g?.label,
      g?.group,
      g?.title,
      g?.key,
      g?.slug,
    ];
    if (candidates.some(isQtyKey)) return g;
  }
  return null;
}

function safeJsonParse<T>(text: string): { ok: true; data: T } | { ok: false } {
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
}

function trimRaw(raw: unknown) {
  // Avoid storing mega payloads; keep it useful.
  // If you really want full raw, you can remove trimming later.
  if (!raw || typeof raw !== "object") return raw;
  return raw;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function priceSinaliteProduct(args: {
  productId: number;
  optionIds: number[];
  store: Store; // "US" | "CA"
}): Promise<PriceResult> {
  const productId = toInt(args.productId);
  if (!productId) throw new Error("Invalid productId for pricing.");

  const optionIds = Array.isArray(args.optionIds)
    ? args.optionIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const store: Store = args.store === "CA" ? "CA" : "US";
  const currency: Currency = storeToCurrency(store);
  const storeCode = currencyToStoreCode(currency);

  const token = await getSinaliteAccessToken();

  // 1) Map IDs -> { options: { groupKey: "valueId" } }
  const mapped = await optionIdsToSinaOptions(productId, optionIds);

  // IMPORTANT: clone so we never mutate a shared object by reference
  const options: Record<string, string> = {
    ...(mapped?.options ?? {}),
  };

  // 2) Ensure we have a Qty selection; if missing, auto-fill with a sensible default
  let hasQty = Object.keys(options).some((k) => isQtyKey(k));

  if (!hasQty) {
    try {
      const { optionsArray } = await getSinaliteProductArrays(String(productId));
      const groups = normalizeOptionGroups(optionsArray || []) as any[];

      const qtyGroup = findQtyGroup(groups);
      if (qtyGroup) {
        const firstId = pickFirstOptionId(qtyGroup);
        if (firstId) {
          // Prefer the actual group name/label if present; else use "qty"
          const key =
            String(qtyGroup?.name ?? qtyGroup?.label ?? qtyGroup?.key ?? "qty").trim() || "qty";
          options[key] = String(firstId);
          hasQty = true;
        }
      }
    } catch {
      // ignore; if still missing, we fail below
    }
  }

  if (!hasQty) {
    throw new Error("Missing required 'qty' option for pricing.");
  }

  // 3) Call SinaLite price API
  const url = `${getBase()}/price/${productId}/${storeCode}`;
  const payload = { productOptions: options };

  const r = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        authorization: token, // expected: "Bearer <token>"
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
    15_000, // 15s hard timeout
  );

  const text = await r.text();
  const parsed = safeJsonParse<SinaPriceResponse>(text);
  const json: SinaPriceResponse | null = parsed.ok ? parsed.data : null;

  if (!r.ok) {
    // don't leak full payload; keep it useful
    const snippet = text.slice(0, 300);
    throw new Error(`SinaLite price failed (${r.status}): ${snippet}`);
  }

  const priceNum = Number(
    json?.price ??
      json?.response?.price ??
      json?.price2?.price ??
      0,
  );

  const unitPrice = Number.isFinite(priceNum) ? priceNum : 0;

  return {
    unitPrice,
    pricingMeta: {
      productOptions:
        (json?.productOptions as any) ??
        (json?.response?.productOptions as any) ??
        options,
      packageInfo: json?.packageInfo ?? json?.response?.packageInfo ?? null,
      raw: trimRaw(json),
    },
  };
}
