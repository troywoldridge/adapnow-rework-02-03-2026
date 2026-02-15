import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { scanAndSendArtworkNeededEmails } from "@/lib/artwork/artworkNeeded";
import { apiError } from "@/lib/apiError";
import { getRequestId } from "@/lib/requestId";
import { withRequestId } from "@/lib/logger";
import { enforcePolicy } from "@/lib/authzPolicy";

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

function toFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  const guard = await enforcePolicy(req, { kind: "cron" });
  if (!guard.ok) return guard.res;

  let body: any = {};
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    }
  } catch {
    body = {};
  }

  const lookbackHours = toFiniteNumber(body?.lookbackHours);
  const limit = toFiniteNumber(body?.limit);

  const args = {
    lookbackHours: lookbackHours != null ? Math.max(1, Math.floor(lookbackHours)) : 72,
    limit: limit != null ? Math.max(1, Math.floor(limit)) : 50,
  };

  try {
    const result = await scanAndSendArtworkNeededEmails(args);
    return NextResponse.json({ ok: true as const, requestId, ...result }, { status: 200, headers: noStoreHeaders() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to run artwork-needed job";
    log.error("Artwork-needed job failed", { message, requestId });

    return NextResponse.json(apiError(500, "INTERNAL_ERROR", message, { requestId }), {
      status: 500,
      headers: noStoreHeaders(),
    });
  }
}
