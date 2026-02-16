// src/app/api/admin/reviews/edit/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema/product_reviews";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/admin/reviews/edit
 *
 * Admin-only patch endpoint for product reviews.
 *
 * Body:
 * {
 *   id: number,
 *   name?: string,
 *   rating?: number,
 *   comment?: string,
 *   approved?: boolean
 * }
 *
 * Response:
 * { ok:true, requestId, review }
 *
 * Future-proofing:
 * - requestId header + no-store
 * - Zod validation
 * - requireAdmin guard
 * - returns minimal review payload
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

const BodySchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    name: z.string().trim().min(1).max(60).optional(),
    rating: z.union([z.number(), z.string()]).optional().transform((v) => (v == null ? undefined : Number(v))),
    comment: z.string().trim().min(1).max(2000).optional(),
    approved: z.boolean().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    await requireAdmin(req);

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);

    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    const id = parsed.data.id;
    if (!Number.isInteger(id) || id <= 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_review_id" }, 400);
    }

    const patch: Record<string, any> = {};

    if (typeof parsed.data.name === "string") {
      patch.name = parsed.data.name.slice(0, 60);
    }
    if (parsed.data.rating !== undefined) {
      const rating = parsed.data.rating;
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return noStoreJson(req, { ok: false as const, requestId, error: "invalid_rating" }, 400);
      }
      patch.rating = rating;
    }
    if (typeof parsed.data.comment === "string") {
      patch.comment = parsed.data.comment;
    }
    if (typeof parsed.data.approved === "boolean") {
      patch.approved = parsed.data.approved;
    }

    if (Object.keys(patch).length === 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "no_editable_fields" }, 400);
    }

    const updated = await db
      .update(productReviews)
      .set(patch)
      .where(eq(productReviews.id, id))
      .returning({
        id: productReviews.id,
        name: productReviews.name,
        rating: productReviews.rating,
        comment: productReviews.comment,
        approved: productReviews.approved,
        createdAt: productReviews.createdAt,
      });

    const review = updated?.[0] ?? null;
    if (!review) {
      return noStoreJson(req, { ok: false as const, requestId, error: "review_not_found" }, 404);
    }

    return noStoreJson(req, { ok: true as const, requestId, review }, 200);
  } catch (err: any) {
    const msg = String(err?.message || err || "server_error");
    console.error("[/api/admin/reviews/edit POST] failed", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
