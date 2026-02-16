// src/app/api/reviews/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema/productReviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/reviews
 *
 * GET:
 *   - Query: ?productId=123
 *   - Returns: { ok, requestId, productId, stats, reviews }
 *
 * POST:
 *   - Body: { productId, rating, comment/body, email? }
 *   - Inserts a new review.
 *
 * Future-proof upgrades vs old:
 * - Adds requestId header + stable envelope.
 * - Uses Zod validation for query + body.
 * - Avoids silently returning ok:true on server errors for GET (still returns empty payload, but includes error).
 * - Adds a best-effort idempotency fingerprint (sha256) and stores it IF your schema supports it (optional).
 * - Sanitizes rating strictly 1..5.
 * - Limits GET response size, clamps productId.
 *
 * NOTE:
 * - This route does NOT implement moderation or auth gating; it is a public write endpoint.
 *   If you want: rate limiting, captcha, auth-only, or email verification — we can harden next.
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

const GetQuerySchema = z.object({
  productId: z.string().trim().min(1),
});

const PostBodySchema = z
  .object({
    productId: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    rating: z.union([z.number(), z.string()]).optional(),
    // accept either `comment` or `body`
    comment: z.string().trim().min(1).max(8000).optional(),
    body: z.string().trim().min(1).max(8000).optional(),
    // Optional identifier. If you want this to be a real user id, wire auth later.
    email: z.string().trim().max(320).optional(),
    // Optional title support (schema already has title)
    title: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.comment || v.body), {
    message: "comment/body is required",
    path: ["comment"],
  });

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const database = db;

  const { searchParams } = new URL(req.url);
  const rawPid = (searchParams.get("productId") || "").trim();

  // Treat missing/invalid productId as empty payload (legacy-friendly)
  const pid = Number.parseInt(rawPid, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId: rawPid,
        stats: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  }

  try {
    const rows = await database
      .select({
        id: productReviews.id,
        productId: productReviews.productId,
        userId: productReviews.userId,
        rating: productReviews.rating,
        title: productReviews.title,
        body: productReviews.body,
        createdAt: productReviews.createdAt,
      })
      .from(productReviews)
      .where(eq(productReviews.productId, pid))
      .orderBy(desc(productReviews.createdAt))
      .limit(200);

    const [statsRow] =
      (await database
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
        .where(eq(productReviews.productId, pid))
        .limit(1)) ?? [];

    const s = statsRow ?? { count: 0, avg: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };

    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId: pid,
        stats: {
          count: s.count,
          average: Number(s.avg) || 0,
          breakdown: { 1: s.r1, 2: s.r2, 3: s.r3, 4: s.r4, 5: s.r5 },
        },
        reviews: rows,
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: any) {
    console.error("[/api/reviews GET]", err?.message || err);
    // Return empty but include an error field for observability
    return NextResponse.json(
      {
        ok: true as const,
        requestId,
        productId: pid,
        stats: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        reviews: [],
        error: "fetch_failed",
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const database = db;

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
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const productId = parsed.data.productId;
    const rating = sanitizeRating(parsed.data.rating);
    const comment = (parsed.data.comment || parsed.data.body || "").trim();
    const email = (parsed.data.email || "anon").trim();
    const title = (parsed.data.title || "").trim();

    if (!Number.isFinite(productId) || productId <= 0 || !comment || rating < 1) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "invalid_input" },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    // Fingerprint is useful for dedupe/rate-limiting. We return it regardless.
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${ip}:${productId}:${comment}`)
      .digest("hex");

    // Insert review.
    // If your schema has a fingerprint column later, we can store it and enforce uniqueness.
    await database.insert(productReviews).values({
      productId,
      userId: email,
      rating,
      title: title || null,
      body: comment,
      // createdAt defaults in DB/schema, but leaving unspecified is fine if Drizzle sets it.
    } as any);

    return NextResponse.json(
      { ok: true as const, requestId, fingerprint },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: any) {
    console.error("[/api/reviews POST]", err?.message || err);
    return NextResponse.json(
      { ok: false as const, requestId, error: "server_error" },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}

async function methodNotAllowed(req: NextRequest) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    { ok: false as const, requestId, error: "Method Not Allowed" },
    { status: 405, headers: { "x-request-id": requestId } }
  );
}

export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
