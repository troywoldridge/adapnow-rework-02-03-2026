// src/app/api/cart/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/cart is a compatibility alias for /api/cart/current.
 *
 * 🚫 IMPORTANT:
 * - Do NOT fetch via absolute origin unless you must.
 * - In Next.js route handlers, a relative fetch("/api/...") stays inside the same deployment,
 *   forwards cookies automatically (same request context), and avoids env-origin drift.
 */
function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

/** Optional: build a best-effort origin for diagnostics / fallback only. */
function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(_req: NextRequest) {
  // First try: relative fetch (best, forwards cookies, no env needed)
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);

  try {
    const res = await fetch("/api/cart/current", {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: ac.signal,
    });

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await res.json().catch(() => ({}));
      return noStore(NextResponse.json(json, { status: res.status }));
    }

    // If something upstream returns non-JSON, pass it through (rare)
    const body = await res.text().catch(() => "");
    return noStore(
      NextResponse.json(
        { ok: false, error: "unexpected_response", detail: body.slice(0, 500) },
        { status: 502 },
      ),
    );
  } catch (err: any) {
    // Fallback: absolute origin (only if relative fetch fails due to some runtime edge)
    try {
      const h = await headers();
      const origin =
        (process.env.PUBLIC_APP_ORIGIN || process.env.NEXT_PUBLIC_BASE_URL || "").trim() ||
        originFromHeaders(h);

      const url = new URL("/api/cart/current", origin).toString();
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { accept: "application/json" },
        // NOTE: when doing absolute fetch we cannot reliably forward Set-Cookie,
        // but the endpoint reads cookies from the incoming request context anyway.
      });

      const json = await res.json().catch(() => ({}));
      return noStore(NextResponse.json(json, { status: res.status }));
    } catch (e2: any) {
      const msg = String(err?.message || err || "fetch_failed");
      return noStore(NextResponse.json({ ok: false, error: msg }, { status: 502 }));
    }
  } finally {
    clearTimeout(timer);
  }
}
