// src/app/api/analytics/careers/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/analytics/careers
 *
 * Lightweight analytics sink for careers page events.
 * - Intentionally DB-optional (won't break if DB/env is down)
 * - Emits structured logs (easy to ingest later)
 *
 * Body:
 * {
 *   event?: string,   // e.g. "view", "submit", "cta_click"
 *   path?: string,
 *   ref?: string,
 *   meta?: object
 * }
 *
 * Response:
 * { ok:true, requestId }
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
    event: z.string().trim().min(1).max(64).optional(),
    path: z.string().trim().max(512).optional(),
    ref: z.string().trim().max(512).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function safeStr(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.slice(0, max);
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);

    // If invalid, still return ok=false but 200 is acceptable for analytics sinks
    // (prevents front-end noise). If you want strict 400, change status to 400.
    if (!parsed.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        200
      );
    }

    const body = parsed.data;

    // Normalize + enrich
    const event = safeStr(body.event ?? "event", 64);
    const path = safeStr(body.path ?? "", 512);
    const ref = safeStr(body.ref ?? "", 512);

    const ip =
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "";

    const ua = safeStr(req.headers.get("user-agent") ?? "", 256);

    // Structured log. Later: wire into a DB table or a queue.
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "analytics.careers",
        requestId,
        event,
        path,
        ref,
        ip: ip || undefined,
        ua: ua || undefined,
        meta: body.meta ?? undefined,
      })
    );

    return noStoreJson(req, { ok: true as const, requestId }, 200);
  } catch (err: any) {
    const msg = String(err?.message || err || "server_error");
    console.warn("[/api/analytics/careers] error:", msg);
    // Still respond 200 to avoid breaking UX; analytics can fail silently.
    return noStoreJson(req, { ok: false as const, requestId, error: msg }, 200);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: true as const, requestId }, 200);
}
