import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/hero-analytics
 *
 * Lightweight tracking of hero-banner events:
 * - impressions
 * - CTA clicks
 * - variant testing
 * - campaign attribution
 *
 * Response: { ok:true, requestId }
 *
 * NOTE:
 * Logs structured JSON to stdout. Swap the sink later (DB/PostHog/GA4) without changing contract.
 */

function getRequestId(req: Request): string {
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

function noStoreJson(req: Request, body: any, status = 200) {
  const requestId = (body?.requestId as string | undefined) || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
    },
  });
}

const BodySchema = z
  .object({
    event: z.string().trim().min(1).max(80), // "hero_impression", "hero_cta_click"
    page: z.string().trim().min(1).max(200).optional(), // path or route
    heroId: z.string().trim().min(1).max(80).optional(), // which hero component/slot
    variant: z.string().trim().max(80).optional(), // A/B label
    campaign: z.string().trim().max(120).optional(), // campaign name
    ref: z.string().trim().max(200).optional(), // referral source
    // ✅ Zod v4 fix: record(keySchema, valueSchema)
    meta: z.record(z.string(), z.unknown()).optional(), // free-form extras (kept small)
  })
  .strict();

export async function POST(req: Request) {
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/hero-analytics POST] failed", msg);
    return noStoreJson(req, { ok: false as const, requestId, error: msg || "unknown_error" }, 500);
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed. Use POST." }, 405);
}
