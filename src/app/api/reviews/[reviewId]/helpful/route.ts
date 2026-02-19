// src/app/api/reviews/[reviewId]/helpful/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema";
import { reviewHelpfulVotes } from "@/lib/db/schema/reviewHelpfulVotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/reviews/:reviewId/helpful
 *
 * Records a "helpful" vote (idempotent per reviewId + voterFingerprint).
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

const ParamsSchema = z.object({
  reviewId: z.string().regex(/^\d+$/, "reviewId must be numeric"),
});

const BodySchema = z
  .object({
    // Optional client-supplied fingerprint (helps idempotency across networks)
    fingerprint: z.string().trim().max(128).optional(),
  })
  .strict()
  .optional();

function normalizeFingerprint(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 64) : "";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ reviewId: string }> }) {
  const requestId = getRequestId(req);

  try {
    const params = await ctx.params;
    const p = ParamsSchema.safeParse(params);
    if (!p.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "invalid_review_id",
          issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const reviewIdNum = Number(p.data.reviewId);

    // Must exist and be approved
    const [rev] =
      (await db
        .select({ id: productReviews.id })
        .from(productReviews)
        .where(and(eq(productReviews.id, reviewIdNum), eq(productReviews.approved, true)))
        .limit(1)) ?? [];

    if (!rev) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "review_not_found" },
        { status: 404, headers: { "x-request-id": requestId } },
      );
    }

    const { userId } = await auth();

    const payload = await req.json().catch(() => null);
    const b = BodySchema?.safeParse(payload);
    if (b && !b.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: b.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }

    const supplied = normalizeFingerprint((b && b.success ? b.data?.fingerprint : undefined) ?? undefined);

    const ip = getClientIp(req.headers);
    const ua = req.headers.get("user-agent") ?? "";

    const fp =
      supplied ||
      crypto
        .createHash("sha256")
        .update(`${ip}::${ua}::review:${reviewIdNum}`)
        .digest("hex")
        .slice(0, 64);

    // Insert vote idempotently via unique index on (reviewId, voterFingerprint)
    await db
      .insert(reviewHelpfulVotes)
      .values({
        reviewId: reviewIdNum,
        voterFingerprint: fp,
        userId: userId ?? null,
        ip,
        isHelpful: true,
      })
      .onConflictDoNothing({
        target: [reviewHelpfulVotes.reviewId, reviewHelpfulVotes.voterFingerprint],
      });

    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(reviewHelpfulVotes)
      .where(and(eq(reviewHelpfulVotes.reviewId, reviewIdNum), eq(reviewHelpfulVotes.isHelpful, true)));

    return NextResponse.json(
      { ok: true as const, requestId, reviewId: reviewIdNum, votes: c, fingerprint: fp },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  } catch (err: any) {
    const message = String(err?.message || err);
    return NextResponse.json(
      { ok: false as const, requestId, error: message || "server_error" },
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

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
