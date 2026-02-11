// src/lib/productAssets.ts
import "server-only";

import productAssetsRaw from "@/data/productAssets.json";

type RawRow = {
  product_id?: number | string | null;
  id?: number | string | null;
  sinalite_id?: number | string | null;
  cloudflare_id?: string | null;
  cf_image_1_id?: string | null;
  cf_image_2_id?: string | null;
  cf_image_3_id?: string | null;
  cf_image_4_id?: string | null;
  [k: string]: unknown;
};

const rows: RawRow[] = Array.isArray(productAssetsRaw)
  ? (productAssetsRaw as unknown as RawRow[])
  : [];

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function firstCloudflareId(r: RawRow): string | null {
  const candidates = [
    r.cloudflare_id,
    r.cf_image_1_id,
    r.cf_image_2_id,
    r.cf_image_3_id,
    r.cf_image_4_id,
  ];
  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return null;
}

const byProductId = new Map<number, string>();

for (const row of rows) {
  const pid =
    toNum(row.product_id) ??
    toNum(row.id) ??
    toNum(row.sinalite_id);

  if (!pid || pid <= 0) continue;

  const cid = firstCloudflareId(row);
  if (!cid) continue;

  // first one wins (stable)
  if (!byProductId.has(pid)) byProductId.set(pid, cid);
}

export function cfImageIdForProduct(productId: number): string | null {
  const pid = toNum(productId);
  if (!pid || pid <= 0) return null;
  return byProductId.get(pid) ?? null;
}
