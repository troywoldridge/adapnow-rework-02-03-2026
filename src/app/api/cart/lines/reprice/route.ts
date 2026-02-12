import "server-only";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Store = "US" | "CA";

type LineInput = {
  lineId: string;
  productId: number;
  optionIds: number[];
  quantity: number;
};

type Body = {
  store: Store;
  lines: LineInput[];
};

function storeToStoreCode(store: Store): "en_ca" | "en_us" {
  // Adjust if your DB uses different codes
  return store === "CA" ? "en_ca" : "en_us";
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function normalizeOptionIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const nums = v
    .map((x) => toInt(x, NaN as any))
    .filter((n) => Number.isFinite(n));
  // de-dupe + sort so key is stable
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function variantKeyFromOptionIds(optionIds: number[]): string {
  // matches Sinalite /variants key format like "5-140-447-448" :contentReference[oaicite:4]{index=4}
  return optionIds.join("-");
}

function parsePrice(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.store !== "US" && body.store !== "CA") || !Array.isArray(body.lines)) {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const storeCode = storeToStoreCode(body.store);

  const lines = body.lines
    .map((l) => {
      const optionIds = normalizeOptionIds(l?.optionIds);
      return {
        lineId: String(l?.lineId ?? "").trim(),
        productId: toInt(l?.productId, 0),
        quantity: toInt(l?.quantity, 0),
        optionIds,
        key: optionIds.length ? variantKeyFromOptionIds(optionIds) : "",
      };
    })
    .filter((l) => l.lineId && l.productId > 0 && l.quantity > 0 && l.key);

  if (lines.length === 0) {
    return NextResponse.json({ ok: true, storeCode, lines: [] });
  }

  const out: Array<{
    lineId: string;
    unitPrice: number | null;
    source: "local" | "miss";
    key: string;
    reason?: string;
  }> = [];

  for (const line of lines) {
    const rows = await db.execute(
      sql<{ price: any }>`
        select price
        from sinalite_product_variants
        where product_id = ${line.productId}
          and store_code = ${storeCode}
          and key = ${line.key}
        limit 1
      `
    );

    const price = parsePrice(rows?.rows?.[0]?.price);

    if (price == null) {
      out.push({
        lineId: line.lineId,
        unitPrice: null,
        source: "miss",
        key: line.key,
        reason: "no_local_variant_price",
      });
      continue;
    }

    out.push({
      lineId: line.lineId,
      unitPrice: price,
      source: "local",
      key: line.key,
    });
  }

  return NextResponse.json({
    ok: true,
    storeCode,
    lines: out,
  });
}
