import "server-only";

import { NextRequest } from "next/server";

import { scanAndSendArtworkNeededEmails } from "@/lib/artwork/artworkNeeded";
import { ApiError, ok, fail, getRequestIdFromHeaders, readJson } from "@/lib/apiError";
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

    const res = ok(result, { requestId: ctx.requestId });
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

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}
