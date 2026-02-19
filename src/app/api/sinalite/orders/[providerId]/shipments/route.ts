// src/app/api/sinalite/orders/[providerId]/shipments/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

/**
 * Sinalite Shipments Proxy
 *
 * GET /api/sinalite/orders/:providerId/shipments
 *
 * - Proxies to Sinalite upstream orders shipments endpoint.
 * - Normalizes response into { ok, requestId, shipments: Shipment[] }.
 * - Supports passthrough query params (filters) safely.
 *
 * SECURITY:
 * - This endpoint should be protected (admin/cron/internal), because it uses vendor credentials.
 *   This implementation supports a shared secret header:
 *     - x-internal-secret: <INTERNAL_API_SECRET | JOB_SECRET | CRON_SECRET>
 *
 * If you want it public for logged-in users only, keep it private and call it from /api/me/shipments
 * on the server (recommended).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Shipment = {
  carrier: string;
  trackingNumber: string;
  status: string;
  eta?: string | null;
  events?: { time: string; description: string; location?: string }[];
};

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

function readRequiredEnv(name: string): string {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function readInternalSecret(): string | null {
  const v =
    process.env.INTERNAL_API_SECRET ||
    process.env.JOB_SECRET ||
    process.env.CRON_SECRET ||
    "";
  const s = String(v).trim();
  return s ? s : null;
}

function isAuthorizedInternal(req: NextRequest): boolean {
  const secret = readInternalSecret();
  if (!secret) return true; // allow in dev if you forgot to set it (you can tighten later)
  const hdr =
    req.headers.get("x-internal-secret") ||
    req.headers.get("authorization") ||
    "";
  const token = hdr.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

const ParamsSchema = z.object({
  providerId: z.string().trim().min(1).max(128),
});

function mapShipment(s: any): Shipment {
  const carrier = s?.carrier ?? s?.provider ?? "Unknown";
  const trackingNumber =
    s?.trackingNumber ?? s?.tracking_number ?? s?.tracking ?? "";
  const status = s?.status ?? s?.currentStatus ?? "";
  const eta = s?.eta ?? s?.estimatedDelivery ?? s?.estimated_arrival ?? null;

  const events = Array.isArray(s?.events)
    ? s.events.map((e: any) => ({
        time: e?.time ?? e?.timestamp ?? e?.date ?? "",
        description: e?.description ?? e?.status ?? "",
        ...(e?.location ? { location: String(e.location) } : {}),
      }))
    : undefined;

  return {
    carrier: String(carrier || "Unknown"),
    trackingNumber: String(trackingNumber || ""),
    status: String(status || ""),
    eta: eta == null ? null : String(eta),
    events,
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ providerId: string }> }) {
  const params = await ctx.params;
  const requestId = getRequestId(req);

  try {
    const p = ParamsSchema.safeParse(ctx.params);
    if (!p.success) {
      return noStoreJson(
        req,
        {
          ok: false as const,
          requestId,
          error: "invalid_providerId",
          issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        400
      );
    }

    if (!isAuthorizedInternal(req)) {
      return noStoreJson(req, { ok: false as const, requestId, error: "forbidden" }, 403);
    }

    // Prefer your existing env names, but also accept the ones in your snippet
    const base =
      String(process.env.SINALITE_API_BASE || "").trim() ||
      String(process.env.SINALITE_BASE || "").trim() ||
      "https://liveapi.sinalite.com";

    // Support either API key or bearer token envs (you can standardize later)
    const apiKey =
      String(process.env.SINALITE_API_KEY || "").trim() ||
      String(process.env.SINALITE_KEY || "").trim();

    // If you use OAuth token flow elsewhere, you can swap this to getSinaliteAccessToken().
    // For now, we keep this route standalone.
    if (!apiKey) {
      throw new Error("Missing env: SINALITE_API_KEY (or SINALITE_KEY)");
    }

    const url = new URL(req.url);
    const passthru = new URLSearchParams(url.search);

    const upstream =
      `${base.replace(/\/+$/, "")}` +
      `/orders/${encodeURIComponent(p.data.providerId)}/shipments` +
      (passthru.toString() ? `?${passthru.toString()}` : "");

    const res = await fetch(upstream, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && (data as any).error) ||
        `sinalite_error_${res.status}`;
      return noStoreJson(req, { ok: false as const, requestId, error: String(msg) }, res.status);
    }

    const rawShipments = Array.isArray((data as any)?.shipments)
      ? (data as any).shipments
      : Array.isArray(data)
      ? data
      : [];

    const shipments: Shipment[] = rawShipments.map(mapShipment);

    return noStoreJson(req, { ok: true as const, requestId, shipments }, 200);
  } catch (e: any) {
    console.error("[/api/sinalite/orders/:providerId/shipments GET] failed", e);
    return noStoreJson(req, { ok: false as const, requestId, error: String(e?.message || e) }, 500);
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}
