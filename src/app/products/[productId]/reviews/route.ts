import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema/productReviews"; // adjust path if different

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

function coerceProductId(paramsProductId: string): number | null {
  const raw = String(paramsProductId || "").trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  return Math.floor(n);
}

// GET: Fetch approved reviews for a product with sort & pagination
export async function GET(req: NextRequest, { params }: { params: { productId: string } }) {
  const productIdNum = coerceProductId(params.productId);
  if (productIdNum == null) {
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
    // IMPORTANT: Select explicit columns so we don't leak internal/moderation fields.
    // Adjust field names here to match your schema exactly.
    const reviews = await db
      .select({
        id: productReviews.id,
        productId: productReviews.productId,
        rating: productReviews.rating,
        title: productReviews.title,
        body: productReviews.body,
        reviewerName: productReviews.reviewerName,
        createdAt: productReviews.createdAt,
        helpfulCount: productReviews.helpfulCount,
      })
      .from(productReviews)
      .where(and(eq(productReviews.productId, productIdNum), eq(productReviews.approved, true)))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    const countRows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(productReviews)
      .where(and(eq(productReviews.productId, productIdNum), eq(productReviews.approved, true)));

    const total = countRows?.[0]?.count ?? 0;

    return json({
      reviews,
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
