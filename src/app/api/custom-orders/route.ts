import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getRequestId(req: Request): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  return crypto.randomUUID();
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return res;
}

/**
 * NOTE:
 * This is intentionally a thin, Cloudflare-compatible route shell.
 * If you previously proxied/forwarded to another internal route, paste that logic in here.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    const body = await req.json().catch(() => ({}));

    // TODO: Replace with your real custom-order logic
    // This keeps TS/build green while preserving a stable API envelope.
    return noStore(
      NextResponse.json(
        { ok: true as const, requestId, received: true, body },
        { status: 200, headers: { "x-request-id": requestId } }
      )
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return noStore(
      NextResponse.json(
        { ok: false as const, requestId, error: msg || "Failed to create custom order" },
        { status: 500, headers: { "x-request-id": requestId } }
      )
    );
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  return noStore(
    NextResponse.json(
      { ok: false as const, requestId, error: "Method not allowed. Use POST." },
      { status: 405, headers: { "x-request-id": requestId } }
    )
  );
}
