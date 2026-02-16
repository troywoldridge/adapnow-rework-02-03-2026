// src/app/api/admin/reviews/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema/product_reviews";
import { requireAdmin } from "@/lib/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Admin Reviews API
 *
 * GET  /api/admin/reviews
 *   Query:
 *     - productId?: string|number (matches product_reviews.productId)
 *     - rating?: 1..5
 *     - approved?: 1|0|true|false   (only if your schema has approved)
 *     - limit?: 1..5000 (default 200)
 *
 * POST /api/admin/reviews
 *   Body:
 *     { action: "delete", ids: (string|number)[] }
 *     { action: "approve"|"unapprove", ids: (string|number)[] }  (only if your schema has approved)
 *
 * Notes:
 * - Uses requireAdmin(req) as single source of truth for auth.
 * - Works whether your review id is numeric OR uuid string (we accept both).
 * - If your schema does NOT have `approved`, approve actions return a clean error.
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

function isUuidLike(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function normalizeId(v: unknown): string | number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // numeric string?
    const asNum = Number(s);
    if (Number.isFinite(asNum) && asNum > 0 && /^\d+$/.test(s)) return Math.floor(asNum);
    // uuid-like?
    if (isUuidLike(s)) return s;
    // fallback: allow non-empty strings (some schemas use text ids)
    return s;
  }
  return null;
}

function hasApprovedColumn(): boolean {
  // Runtime-safe detection: drizzle columns exist as properties on the table object.
  // If your schema doesn't have approved, this will be false.
  return Boolean((productReviews as any)?.approved);
}

const GetQuerySchema = z.object({
  productId: z.string().trim().optional(),
  rating: z.string().trim().optional(),
  approved: z.string().trim().optional(),
  limit: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const q = GetQuerySchema.parse({
      productId: url.searchParams.get("productId") ?? undefined,
      rating: url.searchParams.get("rating") ?? undefined,
      approved: url.searchParams.get("approved") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const conditions: any[] = [];

    if (q.productId) {
      // productId in your schema appears to be string in some versions, so we store as string.
      // If your column is numeric, Drizzle will coerce appropriately for the driver.
      const pid = q.productId;
      conditions.push(eq((productReviews as any).productId, pid));
    }

    if (q.rating) {
      const r = Number(q.rating);
      if (Number.isInteger(r) && r >= 1 && r <= 5) {
        conditions.push(eq((productReviews as any).rating, r));
      } else {
        return noStoreJson(req, { ok: false as const, requestId, error: "invalid_rating" }, 400);
      }
    }

    const approvedSupported = hasApprovedColumn();
    if (q.approved != null && q.approved !== "") {
      if (!approvedSupported) {
        return noStoreJson(req, { ok: false as const, requestId, error: "approved_filter_not_supported" }, 400);
      }
      const s = q.approved.toLowerCase();
      const b =
        s === "1" || s === "true" || s === "yes"
          ? true
          : s === "0" || s === "false" || s === "no"
          ? false
          : null;
      if (b === null) return noStoreJson(req, { ok: false as const, requestId, error: "invalid_approved" }, 400);
      conditions.push(eq((productReviews as any).approved, b));
    }

    const limRaw = q.limit ? Number(q.limit) : 200;
    const limit = Number.isFinite(limRaw) ? Math.min(5000, Math.max(1, Math.floor(limRaw))) : 200;

    const rows = await (conditions.length
      ? db
          .select()
          .from(productReviews)
          .where(and(...conditions))
          .orderBy(desc((productReviews as any).createdAt))
          .limit(limit)
      : db
          .select()
          .from(productReviews)
          .orderBy(desc((productReviews as any).createdAt))
          .limit(limit));

    return noStoreJson(req, { ok: true as const, requestId, rows }, 200);
  } catch (err: any) {
    const msg = String(err?.message || err || "server_error");
    console.error("[/api/admin/reviews GET] failed", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

const PostBodySchema = z
  .object({
    action: z.string().trim(),
    ids: z.array(z.any()).min(1),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    await requireAdmin(req);

    const json = await req.json().catch(() => null);
    const parsed = PostBodySchema.safeParse(json);
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

    const action = parsed.data.action.toLowerCase();
    const normalized = parsed.data.ids.map(normalizeId).filter((x): x is string | number => x != null);

    if (normalized.length === 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "no_valid_ids" }, 400);
    }

    // Split by type so we can safely call inArray for either numeric IDs or string IDs
    const numIds = normalized.filter((x): x is number => typeof x === "number");
    const strIds = normalized.filter((x): x is string => typeof x === "string");

    if (action === "delete") {
      // Delete numeric ids
      if (numIds.length) {
        await db.delete(productReviews).where(inArray((productReviews as any).id, numIds as any));
      }
      // Delete string ids (uuid/text)
      if (strIds.length) {
        await db.delete(productReviews).where(inArray((productReviews as any).id, strIds as any));
      }
      return noStoreJson(req, { ok: true as const, requestId, deleted: normalized.length }, 200);
    }

    if (action === "approve" || action === "unapprove") {
      if (!hasApprovedColumn()) {
        return noStoreJson(req, { ok: false as const, requestId, error: "approve_not_supported" }, 400);
      }
      const next = action === "approve";

      if (numIds.length) {
        await db
          .update(productReviews)
          .set({ approved: next } as any)
          .where(inArray((productReviews as any).id, numIds as any));
      }
      if (strIds.length) {
        await db
          .update(productReviews)
          .set({ approved: next } as any)
          .where(inArray((productReviews as any).id, strIds as any));
      }

      return noStoreJson(req, { ok: true as const, requestId, updated: normalized.length, approved: next }, 200);
    }

    return noStoreJson(req, { ok: false as const, requestId, error: "invalid_action" }, 400);
  } catch (err: any) {
    const msg = String(err?.message || err || "server_error");
    console.error("[/api/admin/reviews POST] failed", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 500);
  }
}

export async function PUT(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}

export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}
