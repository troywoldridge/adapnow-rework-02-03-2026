// src/app/api/sessions/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/sessions
 *
 * Purpose:
 * - Session lifecycle helpers for anonymous sid cookies.
 * - Currently supports DELETE to clear session cookies.
 *
 * Future-proofing:
 * - Clears both legacy and current cookie names ("adap_sid" and "sid").
 * - Adds requestId + no-store headers for consistent API behavior.
 */

const COOKIE_BASE = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
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

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

export async function DELETE(req: NextRequest) {
  const requestId = getRequestId(req);

  const res = NextResponse.json(
    { ok: true as const, requestId },
    { status: 200, headers: { "x-request-id": requestId } }
  );

  // Expire both cookie names
  res.cookies.set("adap_sid", "", { ...COOKIE_BASE, maxAge: 0 });
  res.cookies.set("sid", "", { ...COOKIE_BASE, maxAge: 0 });

  return noStore(res);
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStore(
    NextResponse.json(
      { ok: false as const, requestId, error: "Method not allowed. Use DELETE." },
      { status: 405, headers: { "x-request-id": requestId } }
    )
  );
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStore(
    NextResponse.json(
      { ok: false as const, requestId, error: "Method not allowed. Use /api/sessions/ensure (POST)." },
      { status: 405, headers: { "x-request-id": requestId } }
    )
  );
}
