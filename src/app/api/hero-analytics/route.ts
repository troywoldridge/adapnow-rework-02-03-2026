// src/app/api/hero-analytics/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/hero-analytics
 *
 * Use this for lightweight tracking of hero-banner events:
 * - impressions
 * - CTA clicks
 * - variant testing
 * - campaign attribution
 *
 * Response:
 * - { ok:true, requestId }
 *
 * NOTE:
 * This implementation logs structured JSON to stdout.
 * You can later swap the logger sink (DB table, PostHog, GA4 server endpoint, etc.)
 * without changing the API contract.
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
    event: z.string().trim().min(1).max(80), // e.g. "hero_impression", "hero_cta_click"
    page: z.string().trim().min(1).max(200).optional(), // path or route
    heroId: z.string().trim().min(1).max(80).optional(), // which hero component/slot
    variant: z.string().trim().max(80).optional(), // A/B label
    campaign: z.string().trim().max(120).optional(), // campaign name
    ref: z.string().trim().max(200).optional(), // referral source
    meta: z.record(z.any()).optional(), // free-form extras (kept small)
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
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

    const { userId } = await auth();
    const ip = getClientIp(req.headers);
    const ua = req.headers.get("user-agent") ?? "";
    const referer = req.headers.get("referer") ?? "";

    // Keep payload size sane
    const meta = parsed.data.meta ? JSON.stringify(parsed.data.meta).slice(0, 4000) : null;

    // Structured log line (replace with DB insert later if you want)
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        requestId,
        event: parsed.data.event,
        page: parsed.data.page ?? null,
        heroId: parsed.data.heroId ?? null,
        variant: parsed.data.variant ?? null,
        campaign: parsed.data.campaign ?? null,
        ref: parsed.data.ref ?? null,
        meta,
        userId: userId ?? null,
        ip,
        ua,
        referer,
      })
    );

    return noStoreJson(req, { ok: true as const, requestId }, 200);
  } catch (e: any) {
    console.error("[/api/hero-analytics POST] failed", e?.message || e);
    return noStoreJson(req, { ok: false as const, requestId, error: String(e?.message || e) }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
