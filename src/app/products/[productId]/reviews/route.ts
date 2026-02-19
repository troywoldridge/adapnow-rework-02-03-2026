import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema";

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

function coerceInt(v: string | null, fallback: number): number {
  if (v == null) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function coerceSort(v: string | null): "latest" | "oldest" | "highest" | "lowest" {
  const s = (v || "latest").toLowerCase();
  if (s === "oldest" || s === "highest" || s === "lowest" || s === "latest") return s;
  return "latest";
}

function coerceProductId(paramsProductId: string): string | null {
  const raw = String(paramsProductId || "").trim();
  if (!raw) return null;
  // product_reviews.product_id is varchar/string in your schema
  return raw.slice(0, 128);
}

function toIso(d: unknown): string {
  return d instanceof Date ? d.toISOString() : String(d ?? "");
}

// GET: Fetch approved reviews for a product with sort & pagination
export async function GET(req: NextRequest, context: { params: Promise<{ productId: string }> }) {
  const params = await context.params;
  const productId = coerceProductId(params.productId);

  if (productId == null) {
    return json({ error: "Invalid productId" }, { status: 422 });
  }

  const url = new URL(req.url);
  const sort = coerceSort(url.searchParams.get("sort"));
  const page = clamp(coerceInt(url.searchParams.get("page"), 1), 1, 10_000);
  const pageSize = clamp(coerceInt(url.searchParams.get("pageSize"), 5), 1, 50);
  const offset = (page - 1) * pageSize;

  const orderBy =
    sort === "oldest"
      ? asc(productReviews.createdAt)
      : sort === "highest"
      ? desc(productReviews.rating)
      : sort === "lowest"
      ? asc(productReviews.rating)
      : desc(productReviews.createdAt); // latest default

  try {
    // Schema-aligned fields only (no title/body/reviewerName/helpfulCount).
    const reviews = await db
      .select({
        id: productReviews.id,
        productId: productReviews.productId,
        name: productReviews.name,
        rating: productReviews.rating,
        comment: productReviews.comment,
        createdAt: productReviews.createdAt,
        verified: productReviews.verified,
      })
      .from(productReviews)
      .where(and(eq(productReviews.productId, productId), eq(productReviews.approved, true)))
      .orderBy(orderBy, desc(productReviews.id))
      .limit(pageSize)
      .offset(offset);

    const countRows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(productReviews)
      .where(and(eq(productReviews.productId, productId), eq(productReviews.approved, true)));

    const total = countRows?.[0]?.count ?? 0;

    return json({
      reviews: reviews.map((r) => ({ ...r, createdAt: toIso(r.createdAt) })),
      total,
      page,
      pageSize,
      sort,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load reviews";
    return json({ error: msg }, { status: 500 });
  }
}
