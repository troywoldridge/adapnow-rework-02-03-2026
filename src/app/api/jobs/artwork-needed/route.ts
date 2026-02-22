import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { scanAndSendArtworkNeededEmails } from "@/lib/artwork/artworkNeeded";
import { ApiError, fail, getRequestIdFromHeaders, readJson } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";
import { enforcePolicy, logAuthzDenial } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function withNoStore(res: Response) {
  const hs = noStoreHeaders();
  for (const [k, v] of Object.entries(hs)) (res as any).headers?.set?.(k, v);
  return res;
}

function toFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function jsonOk(body: unknown, requestId: string, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      ...noStoreHeaders(),
    },
  });
}

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req) || `rid_${Date.now()}`;
  const log = withRequestId(requestId);

  const POLICY = "cron" as const;

  try {
    const ctx = await enforcePolicy(req, POLICY);

    // Optional JSON body (cron callers may omit it)
    const body = (await readJson<any>(req).catch(() => null)) || {};

    const lookbackHours = toFiniteNumber(body?.lookbackHours);
    const limit = toFiniteNumber(body?.limit);

    const args = {
      lookbackHours: lookbackHours != null ? Math.max(1, Math.floor(lookbackHours)) : 72,
      limit: limit != null ? Math.max(1, Math.floor(limit)) : 50,
    };

    const result = await scanAndSendArtworkNeededEmails(args);

    // ✅ Avoid TS2783: strip any 'ok' (and requestId) field from result before building envelope
    const { ok: _ignoredOk, requestId: _ignoredRid, ...rest } = (result as any) ?? {};

    const rid = ctx.requestId || requestId;

    const res = jsonOk(
      {
        ...rest,
        ok: true as const,
        requestId: rid,
      },
      rid,
      200
    );

    return withNoStore(res);
  } catch (e: unknown) {
    // Only log authz denials as authz
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({
        req,
        policy: POLICY,
        requestId,
        reason: e.message,
      });
    }

    const message = e instanceof Error ? e.message : "Failed to run artwork-needed job";
    log.error("Artwork-needed job failed", { message, requestId });

    // Keep your existing fail() envelope, but ensure request id header exists
    const res = fail(e, { headers: { "x-request-id": requestId } } as any);
    return withNoStore(res);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req) || `rid_${Date.now()}`;
  const res = NextResponse.json(
    { ok: false as const, requestId, error: "Method Not Allowed. Use POST." },
    { status: 405, headers: { "x-request-id": requestId, ...noStoreHeaders() } }
  );
  return withNoStore(res);
}
