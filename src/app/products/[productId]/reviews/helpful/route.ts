import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
  };
}

function json(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200, headers: noStoreHeaders() });
}

function coerceProductId(paramsProductId: string): number | null {
  const raw = String(paramsProductId || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * GET:
 * Returns a map keyed by review_id:
 * {
 *   "123": { helpful: 4, notHelpful: 1 },
 *   "124": { helpful: 0, notHelpful: 0 }
 * }
 *
 * Notes:
 * - Uses ONE query (no VALUES list).
 * - Tries to use votes.is_helpful boolean.
 * - If is_helpful column does not exist, falls back to total counts as helpful.
 * - Tries to filter product_reviews.approved = true; if the column doesn't exist, falls back.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ productId: string }> }) {
  const params = await context.params;
  const productIdNum = coerceProductId(params.productId);
  if (productIdNum == null) {
    return json({ error: "Invalid productId" }, { status: 422 });
  }

  try {
    // --- Preferred: approved filter + is_helpful boolean breakdown ---
    try {
      const res = await db.execute(
        sql/* sql */`
          SELECT
            r.id AS review_id,
            COALESCE(SUM(CASE WHEN v.is_helpful = TRUE THEN 1 ELSE 0 END), 0)::int  AS helpful,
            COALESCE(SUM(CASE WHEN v.is_helpful = FALSE THEN 1 ELSE 0 END), 0)::int AS not_helpful
          FROM product_reviews r
          LEFT JOIN review_helpful_votes v
            ON v.review_id = r.id
          WHERE r.product_id = ${productIdNum}
            AND r.approved = TRUE
          GROUP BY r.id
        `
      );

      const map: Record<string, { helpful: number; notHelpful: number }> = {};
      for (const row of (res.rows ?? []) as any[]) {
        const key = String(row.review_id);
        map[key] = {
          helpful: Number(row.helpful ?? 0),
          notHelpful: Number(row.not_helpful ?? 0),
        };
      }

      return json(map);
    } catch {
      // fall through to try variants below
    }

    // --- Variant: no approved column, but has is_helpful ---
    try {
      const res = await db.execute(
        sql/* sql */`
          SELECT
            r.id AS review_id,
            COALESCE(SUM(CASE WHEN v.is_helpful = TRUE THEN 1 ELSE 0 END), 0)::int  AS helpful,
            COALESCE(SUM(CASE WHEN v.is_helpful = FALSE THEN 1 ELSE 0 END), 0)::int AS not_helpful
          FROM product_reviews r
          LEFT JOIN review_helpful_votes v
            ON v.review_id = r.id
          WHERE r.product_id = ${productIdNum}
          GROUP BY r.id
        `
      );

      const map: Record<string, { helpful: number; notHelpful: number }> = {};
      for (const row of (res.rows ?? []) as any[]) {
        const key = String(row.review_id);
        map[key] = {
          helpful: Number(row.helpful ?? 0),
          notHelpful: Number(row.not_helpful ?? 0),
        };
      }

      return json(map);
    } catch {
      // fall through
    }

    // --- Fallback: is_helpful column doesn't exist; treat COUNT(*) as "helpful" and notHelpful=0 ---
    // Try with approved first, then without.
    try {
      const res = await db.execute(
        sql/* sql */`
          SELECT
            r.id AS review_id,
            COALESCE(COUNT(v.*), 0)::int AS total
          FROM product_reviews r
          LEFT JOIN review_helpful_votes v
            ON v.review_id = r.id
          WHERE r.product_id = ${productIdNum}
            AND r.approved = TRUE
          GROUP BY r.id
        `
      );

      const map: Record<string, { helpful: number; notHelpful: number }> = {};
      for (const row of (res.rows ?? []) as any[]) {
        const key = String(row.review_id);
        const total = Number(row.total ?? 0);
        map[key] = { helpful: total, notHelpful: 0 };
      }

      return json(map);
    } catch {
      const res = await db.execute(
        sql/* sql */`
          SELECT
            r.id AS review_id,
            COALESCE(COUNT(v.*), 0)::int AS total
          FROM product_reviews r
          LEFT JOIN review_helpful_votes v
            ON v.review_id = r.id
          WHERE r.product_id = ${productIdNum}
          GROUP BY r.id
        `
      );

      const map: Record<string, { helpful: number; notHelpful: number }> = {};
      for (const row of (res.rows ?? []) as any[]) {
        const key = String(row.review_id);
        const total = Number(row.total ?? 0);
        map[key] = { helpful: total, notHelpful: 0 };
      }

      return json(map);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load helpful votes";
    return json({ error: msg }, { status: 500 });
  }
}
