// src/app/api/reviews/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/reviews (legacy-friendly)
 *
 * GET:
 *   - Query: ?productId=<string>
 *   - Returns: { ok, requestId, productId, stats, reviews }
 *
 * POST:
 *   - Body: { productId, name, rating, comment, email?, termsAgreed? }
 *   - Inserts a new review (public endpoint).
 *
 * Notes:
 * - Aligns strictly to product_reviews schema:
 *   productId (varchar/string), name, email?, rating, comment, approved, userIp, termsAgreed, verified, createdAt
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

function getClientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xr = h.get("x-real-ip");
  if (xr) return xr.trim();
  return "0.0.0.0";
}

function sanitizeRating(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function toIso(d: unknown): string {
  return d instanceof Date ? d.toISOString() : String(d ?? "");
}

const GetQuerySchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
  })
  .strict();

const PostBodySchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
    name: z.string().trim().min(2).max(60),
    rating: z.union([z.number(), z.string()]),
    comment: z.string().trim().min(1).max(2000),
    email: z.string().trim().max(80).optional().default(""),
    termsAgreed: z.boolean().optional().default(true),
  })
  .strict();

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  const url = new URL(req.url);
  const parsedQ = GetQuerySchema.safeParse({
    productId: url.searchParams.get("productId") || "",
  });

  // Legacy-friendly: missing/invalid productId => empty payload (still ok:true)
  if (!parsedQ.success) {
    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId: (url.searchParams.get("productId") || "").trim(),
        stats: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }

  const {productId} = parsedQ.data;

  try {
    const rows = await db
      .select({
        id: productReviews.id,
        productId: productReviews.productId,
        name: productReviews.name,
        rating: productReviews.rating,
        comment: productReviews.comment,
        createdAt: productReviews.createdAt,
        verified: productReviews.verified,
        approved: productReviews.approved,
      })
      .from(productReviews)
      .where(eq(productReviews.productId, productId))
      .orderBy(desc(productReviews.createdAt))
      .limit(200);

    const [statsRow] =
      (await db
        .select({
          count: sql<number>`count(*)::int`,
          avg: sql<number>`coalesce(avg(${productReviews.rating}), 0)`,
          r1: sql<number>`count(*) filter (where ${productReviews.rating} = 1)`,
          r2: sql<number>`count(*) filter (where ${productReviews.rating} = 2)`,
          r3: sql<number>`count(*) filter (where ${productReviews.rating} = 3)`,
          r4: sql<number>`count(*) filter (where ${productReviews.rating} = 4)`,
          r5: sql<number>`count(*) filter (where ${productReviews.rating} = 5)`,
        })
        .from(productReviews)
        .where(eq(productReviews.productId, productId))
        .limit(1)) ?? [];

    const s = statsRow ?? { count: 0, avg: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId,
        stats: {
          count: s.count,
          average: Number(s.avg) || 0,
          breakdown: { 1: s.r1, 2: s.r2, 3: s.r3, 4: s.r4, 5: s.r5 },
        },
        reviews: rows.map((r) => ({
          ...r,
          createdAt: toIso(r.createdAt),
        })),
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  } catch (err: any) {
    console.error("[/api/reviews GET]", err?.message || err);
    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId,
        stats: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        error: "fetch_failed",
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const ip = getClientIp(req.headers);
    const json = await req.json().catch(() => null);

    const parsed = PostBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "invalid_input",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const {productId} = parsed.data;
    const name = parsed.data.name.trim();
    const rating = sanitizeRating(parsed.data.rating);
    const comment = parsed.data.comment.trim();
    const email = parsed.data.email.trim();
    const termsAgreed = !!parsed.data.termsAgreed;

    if (!productId || !name || !comment || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "invalid_input" },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    // Best-effort fingerprint for observability/dedupe (not stored unless schema has a column later)
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${ip}:${productId}:${name}:${rating}:${comment}`)
      .digest("hex");

    const approvedFlag = String(process.env.REVIEWS_AUTO_APPROVE || "").trim() === "true";

    const [row] = await db
      .insert(productReviews)
      .values({
        productId,
        name,
        email: email || null,
        rating,
        comment,
        approved: approvedFlag,
        userIp: ip,
        termsAgreed,
        verified: false,
      })
      .returning({
        id: productReviews.id,
        createdAt: productReviews.createdAt,
        approved: productReviews.approved,
        verified: productReviews.verified,
      });

    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        fingerprint,
        review: {
          id: row.id,
          createdAt: toIso(row.createdAt),
          approved: row.approved,
          verified: row.verified,
        },
        moderation: approvedFlag ? "approved" : "pending",
      },
      { status: approvedFlag ? 201 : 202, headers: { "x-request-id": requestId } },
    );
  } catch (err: any) {
    console.error("[/api/reviews POST]", err?.message || err);
    return NextResponse.json(
      { ok: false as const, requestId, error: "server_error" },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}

async function methodNotAllowed(req: NextRequest) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    { ok: false as const, requestId, error: "Method Not Allowed" },
    { status: 405, headers: { "x-request-id": requestId } },
  );
}

export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
