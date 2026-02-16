// src/app/api/analytics/guide-download/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { db } from "@/lib/db";

// Prefer importing the actual table from your Drizzle schema.
// If your project exports it differently, update this import path to match.
import { guideDownloadEvents } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/analytics/guide-download
 *
 * Records download analytics for guide PDFs/assets.
 *
 * Goals:
 * - Do NOT block UX if analytics fails (always returns {ok:true} on insert failure)
 * - Uses Drizzle db instead of raw pg Pool (single DB layer)
 * - Supports sendBeacon/fetch JSON payloads
 * - Minimal validation + safe truncation
 *
 * Body:
 * {
 *   href: string,
 *   label: string,
 *   categoryPath: string,
 *   sizeBytes?: number
 * }
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

function ipFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for") || "";
  if (xff) return xff.split(",")[0].trim();
  const real = h.get("x-real-ip") || "";
  return real.trim();
}

function s(v: unknown, max = 4000): string {
  const out = typeof v === "string" ? v : v == null ? "" : String(v);
  const trimmed = out.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function n(v: unknown, def = 0): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

const BodySchema = z
  .object({
    href: z.string().trim().min(1).max(1200),
    label: z.string().trim().min(1).max(400),
    categoryPath: z.string().trim().min(1).max(600),
    sizeBytes: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  // Support both sendBeacon (application/json) and fetch
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return noStoreJson(req, { ok: true as const, requestId }, 200);
  }

  let json: unknown = null;
  try {
    json = await req.json();
  } catch {
    // For analytics, do not error hard (but still surface ok:false for debugging if needed)
    return noStoreJson(req, { ok: false as const, requestId, error: "invalid_json" }, 200);
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    // For analytics, do not error hard
    return noStoreJson(req, { ok: true as const, requestId }, 200);
  }

  const href = s(parsed.data.href, 1200);
  const label = s(parsed.data.label, 400);
  const categoryPath = s(parsed.data.categoryPath, 600);
  const sizeBytes = Math.max(0, Math.floor(n(parsed.data.sizeBytes, 0)));

  const ua = s(req.headers.get("user-agent") || "", 800);
  const ip = s(ipFromHeaders(req.headers), 120);

  try {
    // If your table name/columns differ, update the mapping here.
    await db.insert(guideDownloadEvents).values({
      href,
      label,
      categoryPath,
      sizeBytes,
      userAgent: ua || null,
      ip: ip || null,
    } as any);

    return noStoreJson(req, { ok: true as const, requestId }, 200);
  } catch (err: any) {
    // Never block downloads because analytics failed
    console.warn("[/api/analytics/guide-download] insert failed:", err?.message || err);
    return noStoreJson(req, { ok: true as const, requestId }, 200);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: true as const, requestId }, 200);
}
