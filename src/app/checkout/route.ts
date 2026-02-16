// src/app/checkout/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { headers, cookies } from "next/headers";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /checkout (route handler)
 *
 * Purpose:
 * - Server-side redirect into Stripe Checkout (or back to cart review with a toast hash).
 *
 * Upgrades / future-proofing:
 * - Works in Next where headers()/cookies() may be sync or async (safe wrappers).
 * - Uses your *current* checkout creator endpoint: /api/checkout/start (not legacy /api/create-checkout-session).
 * - Forwards cookies so the API sees the same SID/cart.
 * - Adds requestId for tracing.
 * - Hardened parsing for non-JSON responses.
 * - Timeout + clean error mapping into URL hash for UX.
 */

function newRequestId(req?: NextRequest): string {
  const existing = req?.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

async function getHdrs(): Promise<Headers> {
  const maybe = headers() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function getJar(): Promise<any> {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

// Redirect back to review WITHOUT query params (use hash for UX toast)
function backToReviewWithHash(origin: string, message?: string) {
  const hash = message ? `#checkout_error=${encodeURIComponent(message)}` : "";
  return NextResponse.redirect(`${origin}/cart/review${hash}`, 303);
}

function buildCookieHeader(jar: any): string {
  try {
    const all = typeof jar?.getAll === "function" ? jar.getAll() : [];
    return Array.isArray(all) ? all.map((c: any) => `${c.name}=${c.value}`).join("; ") : "";
  } catch {
    return "";
  }
}

async function createAndRedirect(req?: NextRequest) {
  const requestId = newRequestId(req);
  const h = await getHdrs();
  const origin = originFromHeaders(h);

  const jar = await getJar();
  const cookieHeader = buildCookieHeader(jar);

  // Prefer your rebuilt endpoint:
  // - src/app/api/checkout/start/route.ts
  const endpoint = `${origin}/api/checkout/start`;

  const ac = new AbortController();
  const timeoutMs = 12_000;
  const t = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      cache: "no-store",
      signal: ac.signal,
      redirect: "follow",
    });
  } catch (err: any) {
    clearTimeout(t);
    const msg = String(err?.name === "AbortError" ? "timeout" : "network_error");
    console.error("[/checkout] create session network error:", err?.message || err);
    return backToReviewWithHash(origin, msg);
  } finally {
    clearTimeout(t);
  }

  const ct = res.headers.get("content-type") || "";
  let json: any = null;

  if (ct.includes("application/json")) {
    try {
      json = await res.json();
    } catch (err: any) {
      console.warn("[/checkout] JSON parse failed:", err?.message || err);
    }
  } else {
    try {
      const txt = await res.text();
      console.warn("[/checkout] non-JSON response:", res.status, txt.slice(0, 500));
    } catch {
      /* ignore */
    }
  }

  // Success: expect { ok:true, url:string }
  if (res.ok && json?.ok && typeof json?.url === "string" && json.url) {
    return NextResponse.redirect(json.url, 303);
  }

  // Error mapping
  const reason =
    (json && (json.error || json.message)) ||
    (res.status === 400 ? "bad_request" : `http_${res.status}`);

  console.warn("[/checkout] session failure:", { status: res.status, reason, requestId });
  return backToReviewWithHash(origin, String(reason || "unknown_error"));
}

export async function GET(req: NextRequest) {
  return createAndRedirect(req);
}

export async function POST(req: NextRequest) {
  return createAndRedirect(req);
}
