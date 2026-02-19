// src/app/api/cart/sinalite/price/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { getSinalitePriceRegular } from "@/lib/sinalite.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/cart/sinalite/price
 *
 * Stable envelope:
 * - Success: { ok:true, requestId, productId, optionIds, store, raw }
 * - Error:   { ok:false, requestId, productId?, optionIds?, store, error, detail? }
 *
 * Body:
 * {
 *   productId: number|string,
 *   optionIds: (number|string)[] | "1,2,3",
 *   store?: "US"|"CA"                 (default "US")
 *   storeCode?: "en_us"|"en_ca"|6|9   (optional; normalized)
 * }
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

function toFiniteInt(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(v.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseOptionIds(input: unknown): number[] {
  const arr: unknown[] = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\s,]+/g).filter(Boolean)
      : [];

  const out: number[] = [];
  const seen = new Set<number>();

  for (const v of arr) {
    const n = toFiniteInt(v);
    if (n === null) continue;
    if (n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  return out;
}

function normalizeStore(raw: unknown): "US" | "CA" {
  const s = String(raw ?? "").trim().toUpperCase();
  return s === "CA" ? "CA" : "US";
}

/**
 * Canonical storeCode in this repo is textual: "en_us" | "en_ca".
 * Some docs/older code reference numeric storeId 9/6 — accept and normalize.
 */
function normalizeStoreCode(raw: unknown, store: "US" | "CA"): "en_us" | "en_ca" {
  const v = String(raw ?? "").trim().toLowerCase();

  if (v === "en_us" || v === "us" || v === "usd") return "en_us";
  if (v === "en_ca" || v === "ca" || v === "cad") return "en_ca";

  // legacy numeric storeIds sometimes show up in docs/tools
  if (v === "9") return "en_us";
  if (v === "6") return "en_ca";

  // default by store
  return store === "CA" ? "en_ca" : "en_us";
}

const BodySchema = z
  .object({
    productId: z.any(),
    optionIds: z.any(),
    store: z.enum(["US", "CA"]).optional(),
    storeCode: z.any().optional(),
  })
  .passthrough();

async function readJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    // ignore
  }
  try {
    const txt = await req.text();
    if (!txt || !txt.trim()) return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  const json = await readJsonBody(req);
  const parsed = BodySchema.safeParse(json);

  if (!parsed.success) {
    return noStoreJson(
      req,
      {
        ok: false as const,
        requestId,
        error: "invalid_body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }

  const body = parsed.data;

  const store = normalizeStore(body.store);
  const productId = toFiniteInt(body.productId);

  if (productId === null || productId <= 0) {
    return noStoreJson(req, { ok: false as const, requestId, store, error: "invalid_productId" }, 400);
  }

  const optionIds = parseOptionIds(body.optionIds);
  if (!optionIds.length) {
    return noStoreJson(req, { ok: false as const, requestId, productId, store, error: "optionIds_required" }, 400);
  }

  // IMPORTANT: pass textual storeCode to the client (repo canonical: en_us/en_ca)
  const sc = normalizeStoreCode(body.storeCode, store);

  try {
    const raw = await (getSinalitePriceRegular as any)(productId, optionIds, sc);

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId,
      optionIds,
      store,
      raw,
    });
  } catch (e: any) {
    const detail = String(e?.message ?? e ?? "Upstream failed");
    console.error("[/api/cart/sinalite/price POST] upstream failed:", detail);

    // Degrade gracefully (UI gets a stable envelope)
    return noStoreJson(
      req,
      {
        ok: false as const,
        requestId,
        productId,
        optionIds,
        store,
        error: "upstream_failed",
        detail,
      },
      200,
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
