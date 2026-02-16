// src/app/api/products/[productId]/reviews/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productReviews, reviewHelpfulVotes } from "@/lib/db/schema/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Product Reviews API
 *
 * GET /api/products/:productId/reviews
 * - Supports cursor pagination for sort=newest|oldest using (createdAt,id) tiebreaker.
 * - Supports page/pageSize for sort=helpful|highest|lowest.
 * - Includes helpfulCount and votedByMe.
 *
 * POST /api/products/:productId/reviews
 * - Creates a review (Turnstile optional but strongly recommended).
 * - Basic rate limiting + duplicate guard.
 * - Auto-approve via REVIEWS_AUTO_APPROVE=true.
 *
 * Future-proofing:
 * - requestId in response + header.
 * - Zod validation for query/body.
 * - Conservative limits to prevent abuse.
 */

const MAX_PAGE_SIZE = 50;
const MAX_NAME = 60;
const MAX_EMAIL = 80;
const MAX_COMMENT = 2000;

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

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function toIso(d: unknown): string {
  return d instanceof Date ? d.toISOString() : String(d ?? "");
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

const ParamsSchema = z.object({
  productId: z.string().trim().min(1),
});

const GetQuerySchema = z
  .object({
    sort: z.string().trim().optional(),
    fingerprint: z.string().trim().max(128).optional(),
    page: z.string().trim().optional(),
    pageSize: z.string().trim().optional(),
    cursor: z.string().trim().optional(),
    dir: z.enum(["next", "prev"]).optional(),
  })
  .strict();

function toInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function normalizeSort(raw: string | undefined) {
  const s = (raw || "newest").toLowerCase();
  if (s === "newest" || s === "oldest" || s === "helpful" || s === "most_helpful" || s === "highest" || s === "lowest" || s === "rating" || s === "rating_desc" || s === "rating_asc")
    return s;
  return "newest";
}

function buildFingerprint(req: NextRequest, supplied?: string) {
  const fp = (supplied || "").trim().slice(0, 64);
  if (fp) return fp;
  const ip = getClientIp(req.headers);
  const ua = req.headers.get("user-agent") ?? "";
  return crypto.createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 64);
}

function encodeCursor(t: string, id: number): string {
  return Buffer.from(JSON.stringify({ t, id }), "utf8").toString("base64");
}

function decodeCursor(b64: string): null | { t: string; id: number } {
  if (!b64) return null;
  try {
    const obj = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (obj && typeof obj.t === "string" && typeof obj.id === "number") return obj;
    return null;
  } catch {
    return null;
  }
}

const PostBodySchema = z
  .object({
    name: z.string().trim().min(2).max(MAX_NAME),
    email: z.string().trim().max(MAX_EMAIL).optional().default(""),
    rating: z.union([z.number(), z.string()]).transform((v) => Number(v)),
    comment: z.string().trim().min(5).max(MAX_COMMENT),
    termsAgreed: z.boolean(),
    turnstileToken: z.string().trim().optional(),
    // honeypot
    website: z.string().optional(),
  })
  .strict();

async function verifyTurnstile(opts: {
  token: string;
  ip: string;
}): Promise<{ ok: true } | { ok: false; codes: string[] }> {
  const secret = String(process.env.CLOUDFLARE_TURNSTILE_SECRET || "").trim();
  if (!secret) {
    // Not configured: allow but warn (you asked for future-proof; this keeps dev easy).
    console.warn("CLOUDFLARE_TURNSTILE_SECRET not set; Turnstile verification skipped.");
    return { ok: true };
  }

  if (!opts.token) return { ok: false, codes: ["missing-input-response"] };

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", opts.token);
  form.append("remoteip", opts.ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; ["error-codes"]?: string[] }
    | null;

  if (!data?.success) {
    return { ok: false, codes: data?.["error-codes"] || ["turnstile_failed"] };
  }

  return { ok: true };
}

/* -------------------------------- GET -------------------------------- */
export async function GET(req: NextRequest, ctx: { params: { productId: string } }) {
  const requestId = getRequestId(req);

  try {
    const p = ParamsSchema.safeParse(ctx.params);
    if (!p.success) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_product_id" }, 400);
    }
    const productId = p.data.productId;

    const url = new URL(req.url);
    const q = GetQuerySchema.safeParse({
      sort: url.searchParams.get("sort") || undefined,
      fingerprint: url.searchParams.get("fingerprint") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      dir: (url.searchParams.get("dir") || undefined) as any,
    });

    if (!q.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_query",
          issues: q.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    const sort = normalizeSort(q.data.sort);
    const dir = q.data.dir || "next";
    const pageSize = toInt(q.data.pageSize, 10, 1, MAX_PAGE_SIZE);
    const page = toInt(q.data.page, 1, 1, 1000000);

    const baseWhere = and(eq(productReviews.productId, productId), eq(productReviews.approved, true));

    // total
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(productReviews)
      .where(baseWhere);

    // helpful count subselect
    const helpfulExpr = sql<number>`
      (select count(*)::int
         from review_helpful_votes v
        where v.review_id = ${productReviews.id}
          and v.is_helpful = true)
    `;

    const cursorable = sort === "newest" || sort === "oldest";
    const cursor = decodeCursor(q.data.cursor || "");

    const { userId } = await auth();
    const fingerprint = buildFingerprint(req, q.data.fingerprint);

    if (cursorable) {
      const orderNewest = [desc(productReviews.createdAt), desc(productReviews.id)] as const;
      const orderOldest = [asc(productReviews.createdAt), asc(productReviews.id)] as const;
      const orderExpr = sort === "newest" ? orderNewest : orderOldest;

      let whereExpr: any = baseWhere;

      if (cursor) {
        const t = cursor.t;
        const id = cursor.id;

        if (sort === "newest") {
          if (dir === "prev") {
            whereExpr = and(
              baseWhere,
              sql`( ${productReviews.createdAt} > ${t} OR (${productReviews.createdAt} = ${t} AND ${productReviews.id} > ${id}) )`
            );
          } else {
            whereExpr = and(
              baseWhere,
              sql`( ${productReviews.createdAt} < ${t} OR (${productReviews.createdAt} = ${t} AND ${productReviews.id} < ${id}) )`
            );
          }
        } else {
          // oldest
          if (dir === "prev") {
            whereExpr = and(
              baseWhere,
              sql`( ${productReviews.createdAt} < ${t} OR (${productReviews.createdAt} = ${t} AND ${productReviews.id} < ${id}) )`
            );
          } else {
            whereExpr = and(
              baseWhere,
              sql`( ${productReviews.createdAt} > ${t} OR (${productReviews.createdAt} = ${t} AND ${productReviews.id} > ${id}) )`
            );
          }
        }
      }

      const rows = await db
        .select({
          id: productReviews.id,
          name: productReviews.name,
          rating: productReviews.rating,
          comment: productReviews.comment,
          createdAt: productReviews.createdAt,
          verified: productReviews.verified,
          helpfulCount: helpfulExpr,
        })
        .from(productReviews)
        .where(whereExpr)
        .orderBy(...orderExpr)
        .limit(pageSize);

      // votedByMe map
      const ids = rows.map((r) => r.id);
      const votedMap: Record<number, boolean> = {};
      if (ids.length) {
        let voterCond: any;
        if (userId && fingerprint) {
          voterCond = or(eq(reviewHelpfulVotes.userId, userId), eq(reviewHelpfulVotes.voterFingerprint, fingerprint));
        } else if (userId) {
          voterCond = eq(reviewHelpfulVotes.userId, userId);
        } else if (fingerprint) {
          voterCond = eq(reviewHelpfulVotes.voterFingerprint, fingerprint);
        }

        if (voterCond) {
          const votedRows = await db
            .select({ reviewId: reviewHelpfulVotes.reviewId })
            .from(reviewHelpfulVotes)
            .where(and(inArray(reviewHelpfulVotes.reviewId, ids), eq(reviewHelpfulVotes.isHelpful, true), voterCond));
          for (const vr of votedRows) votedMap[vr.reviewId] = true;
        }
      }

      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        rating: r.rating,
        comment: r.comment,
        createdAt: toIso(r.createdAt),
        verified: r.verified,
        helpfulCount: r.helpfulCount ?? 0,
        votedByMe: !!votedMap[r.id],
      }));

      const first = rows[0];
      const last = rows[rows.length - 1];
      const nextCursor = last ? encodeCursor(toIso(last.createdAt), last.id) : null;
      const prevCursor = first ? encodeCursor(toIso(first.createdAt), first.id) : null;

      return noStoreJson(req, {
        ok: true as const,
        requestId,
        productId,
        total,
        sort,
        cursor: nextCursor,
        prevCursor,
        pageSize,
        items,
        fingerprint, // helps client reuse same fingerprint for vote checks
      });
    }

    // Non-cursor sorts: page/pageSize
    let orderExpr: any;
    switch (sort) {
      case "helpful":
      case "most_helpful":
        orderExpr = desc(helpfulExpr);
        break;
      case "highest":
      case "rating":
      case "rating_desc":
        orderExpr = desc(productReviews.rating);
        break;
      case "lowest":
      case "rating_asc":
        orderExpr = asc(productReviews.rating);
        break;
      case "oldest":
        orderExpr = asc(productReviews.createdAt);
        break;
      default:
        orderExpr = desc(productReviews.createdAt);
        break;
    }

    const offset = (page - 1) * pageSize;

    const rows = await db
      .select({
        id: productReviews.id,
        name: productReviews.name,
        rating: productReviews.rating,
        comment: productReviews.comment,
        createdAt: productReviews.createdAt,
        verified: productReviews.verified,
        helpfulCount: helpfulExpr,
      })
      .from(productReviews)
      .where(baseWhere)
      .orderBy(orderExpr, desc(productReviews.id))
      .limit(pageSize)
      .offset(offset);

    const ids = rows.map((r) => r.id);
    const votedMap: Record<number, boolean> = {};
    if (ids.length) {
      let voterCond: any;
      if (userId && fingerprint) {
        voterCond = or(eq(reviewHelpfulVotes.userId, userId), eq(reviewHelpfulVotes.voterFingerprint, fingerprint));
      } else if (userId) {
        voterCond = eq(reviewHelpfulVotes.userId, userId);
      } else if (fingerprint) {
        voterCond = eq(reviewHelpfulVotes.voterFingerprint, fingerprint);
      }

      if (voterCond) {
        const votedRows = await db
          .select({ reviewId: reviewHelpfulVotes.reviewId })
          .from(reviewHelpfulVotes)
          .where(and(inArray(reviewHelpfulVotes.reviewId, ids), eq(reviewHelpfulVotes.isHelpful, true), voterCond));
        for (const vr of votedRows) votedMap[vr.reviewId] = true;
      }
    }

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      rating: r.rating,
      comment: r.comment,
      createdAt: toIso(r.createdAt),
      verified: r.verified,
      helpfulCount: r.helpfulCount ?? 0,
      votedByMe: !!votedMap[r.id],
    }));

    return noStoreJson(req, {
      ok: true as const,
      requestId,
      productId,
      total,
      sort,
      page,
      pageSize,
      items,
      fingerprint,
    });
  } catch (err: any) {
    const message = String(err?.message || err);
    return noStoreJson(req, { ok: false as const, requestId, error: message || "server_error" }, 500);
  }
}

/* -------------------------------- POST -------------------------------- */
export async function POST(req: NextRequest, ctx: { params: { productId: string } }) {
  const requestId = getRequestId(req);

  try {
    const p = ParamsSchema.safeParse(ctx.params);
    if (!p.success) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_product_id" }, 400);
    }
    const productId = p.data.productId;

    const ip = getClientIp(req.headers);
    await auth(); // optional for future “verified buyer” enrichment

    const json = await req.json().catch(() => null);
    const parsed = PostBodySchema.safeParse(json);

    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_input",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    if (parsed.data.website) {
      return noStoreJson(req, { ok: false as const, requestId, error: "spam_detected" }, 400);
    }

    const email = parsed.data.email.trim();
    if (email && (!isEmail(email) || email.length > MAX_EMAIL)) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_email" }, 400);
    }

    const rating = Math.trunc(parsed.data.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_rating" }, 400);
    }

    // Turnstile verify (if configured)
    const token =
      (parsed.data.turnstileToken ?? req.headers.get("cf-turnstile-response") ?? "").toString();

    const ts = await verifyTurnstile({ token, ip });
    if (!ts.ok) {
      return noStoreJson(
        req,
        { ok: false as const, requestId, error: "turnstile_failed", details: ts.codes },
        403
      );
    }

    // Rate limit: one submission per product+IP within 8h
    const [{ recent }] =
      (await db
        .select({ recent: sql<number>`count(*)::int` })
        .from(productReviews)
        .where(
          and(
            eq(productReviews.productId, productId),
            eq(productReviews.userIp, ip),
            sql`${productReviews.createdAt} > NOW() - INTERVAL '8 hours'`
          )
        )) ?? [{ recent: 0 }];

    if ((recent ?? 0) > 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "rate_limited" }, 429);
    }

    // Duplicate guard: same text within 7d on same product
    const [{ dup }] =
      (await db
        .select({ dup: sql<number>`count(*)::int` })
        .from(productReviews)
        .where(
          and(
            eq(productReviews.productId, productId),
            sql`${productReviews.createdAt} > NOW() - INTERVAL '7 days'`,
            sql`md5(${productReviews.comment}) = md5(${parsed.data.comment})`
          )
        )) ?? [{ dup: 0 }];

    if ((dup ?? 0) > 0) {
      return noStoreJson(req, { ok: false as const, requestId, error: "duplicate_content" }, 409);
    }

    const approvedFlag = String(process.env.REVIEWS_AUTO_APPROVE || "").trim() === "true";

    const [row] = await db
      .insert(productReviews)
      .values({
        productId,
        name: parsed.data.name,
        email: email || null,
        rating,
        comment: parsed.data.comment,
        approved: approvedFlag,
        userIp: ip,
        termsAgreed: true,
        verified: false,
      })
      .returning({
        id: productReviews.id,
        createdAt: productReviews.createdAt,
        approved: productReviews.approved,
        verified: productReviews.verified,
      });

    return noStoreJson(
      req,
      {
        ok: true as const,
        requestId,
        productId,
        review: {
          id: row.id,
          createdAt: toIso(row.createdAt),
          approved: row.approved,
          verified: row.verified,
        },
        moderation: approvedFlag ? "approved" : "pending",
      },
      approvedFlag ? 201 : 202
    );
  } catch (err: any) {
    const message = String(err?.message || err);
    return noStoreJson(req, { ok: false as const, requestId, error: message || "server_error" }, 500);
  }
}
