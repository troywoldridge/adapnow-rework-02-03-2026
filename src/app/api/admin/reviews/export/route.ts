// src/app/api/admin/reviews/export/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews } from "@/lib/db/schema";

import { requireAdmin } from "@/lib/requireAdmin";

// json2csv runtime import (TS types often missing in some setups)
import { parse as toCSV } from "json2csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/reviews/export
 *
 * Admin-only export for product reviews.
 *
 * Query:
 *  - format=csv|json     (default csv)
 *  - approved=1|true     (optional filter)
 *  - limit=1..10000      (default 5000)
 *
 * Response:
 * - CSV download or JSON download
 *
 * Future-proofing:
 * - Uses requireAdmin(req) (single source of truth for authz)
 * - requestId header + no-store
 * - safer headers + filenames
 * - stable and predictable fields
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

function noStoreHeaders(requestId: string): HeadersInit {
  return {
    "x-request-id": requestId,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
  };
}

function toBool(v: string | null): boolean | null {
  if (v == null) return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return null;
}

const QuerySchema = z
  .object({
    format: z.string().trim().optional(),
    approved: z.string().trim().optional(),
    limit: z.string().trim().optional(),
  })
  .strict();

function filenameSafe(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      format: url.searchParams.get("format") ?? undefined,
      approved: url.searchParams.get("approved") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          error: "invalid_query",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400, headers: noStoreHeaders(requestId) }
      );
    }

    const format = (parsed.data.format || "csv").toLowerCase();
    const approvedFilter = toBool(parsed.data.approved ?? null);

    const limRaw = parsed.data.limit ? Number(parsed.data.limit) : 5000;
    const limit = Number.isFinite(limRaw) ? Math.min(10000, Math.max(1, Math.floor(limRaw))) : 5000;

    // Build query
    // NOTE: if you want approved filter, we can add `.where(eq(productReviews.approved, true))`
    // only when the query param is provided.
    let reviewsQuery = db.select().from(productReviews).orderBy(desc(productReviews.createdAt)).limit(limit);

    if (approvedFilter !== null) {
      // dynamic import to avoid extra drizzle operators at top if your lint is strict
      const { eq } = await import("drizzle-orm");
      reviewsQuery = db
        .select()
        .from(productReviews)
        .where(eq(productReviews.approved, approvedFilter))
        .orderBy(desc(productReviews.createdAt))
        .limit(limit);
    }

    const reviews = await reviewsQuery;

    const stamp = Date.now();
    const base = filenameSafe(`reviews-export-${stamp}`);
    const headersBase = noStoreHeaders(requestId);

    if (format === "json") {
      return new NextResponse(JSON.stringify(reviews), {
        status: 200,
        headers: {
          ...headersBase,
          "Content-Disposition": `attachment; filename=${base}.json`,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    // CSV fields — keep stable + explicit
    // Adjust these to your actual schema columns; these match the typical productReviews table used earlier.
    const fields = [
      "id",
      "productId",
      "name",
      "email",
      "rating",
      "comment",
      "approved",
      "createdAt",
      "userIp",
      "termsAgreed",
      "verified",
    ];

    const csv = toCSV(reviews as any, { fields });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...headersBase,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${base}.csv`,
      },
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "server_error");
    console.error("[/api/admin/reviews/export GET] failed", msg);
    return NextResponse.json(
      { ok: false, requestId, error: msg },
      { status: 500, headers: noStoreHeaders(requestId) }
    );
  }
}
