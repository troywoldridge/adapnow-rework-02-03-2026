// src/lib/rateLimit.ts
import { NextResponse } from "next/server";

/**
 * Simple in-memory IP-based token bucket.
 * - Suitable for single-instance or dev use.
 * - For distributed deployments, replace with Redis or an edge KV.
 *
 * Notes:
 * - Uses X-Forwarded-For when present, otherwise falls back to "local".
 * - Exposes both a low-level thrower (rateLimit) and a route-friendly helper (enforceRateLimit).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function firstHeaderValue(headers: Headers, name: string): string {
  const v = headers.get(name);
  if (!v) return "";
  return v.split(",")[0]?.trim() ?? "";
}

function ipFrom(req: Request): string {
  // Prefer proxy header; fall back to a stable placeholder in local/dev.
  // If you're behind multiple proxies, the left-most entry is the client IP in typical setups.
  const xff = firstHeaderValue(req.headers, "x-forwarded-for");
  return xff || "local";
}

function keyFor(req: Request, scope: string): string {
  return `${scope}:${ipFrom(req)}`;
}

export type RateLimitOk = { headers: Record<string, string> };

export type RateLimitError = Error & {
  status?: number;
  headers?: Record<string, string>;
};

/**
 * Low-level limiter.
 * Throws an Error with status/headers when the limit is exceeded.
 * Returns rate headers on success (so you can forward them if you want).
 */
export async function rateLimit(
  req: Request,
  scope = "api",
  limit = 60,
  windowMs = 60_000,
): Promise<RateLimitOk> {
  const now = Date.now();
  const key = keyFor(req, scope);

  const current = buckets.get(key);
  const bucket: Bucket =
    current && now <= current.resetAt
      ? current
      : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  // Remaining should be 0 when you're at/over the limit.
  const remaining = Math.max(0, limit - bucket.count);
  const resetSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetSec),
  };

  if (bucket.count > limit) {
    const err = new Error(`Rate limit exceeded. Try again in ${resetSec}s.`) as RateLimitError;
    err.status = 429;
    err.headers = {
      ...headers,
      "Retry-After": String(resetSec),
    };
    throw err;
  }

  return { headers };
}

/**
 * High-level adapter for API routes.
 * - Returns a NextResponse(429) when limited, otherwise `null`.
 * - Keeps your route code clean:
 *
 *   const limited = await enforceRateLimit(req, "orders:show", 40, 60_000);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  req: Request,
  scope = "api",
  limit = 60,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  try {
    const { headers } = await rateLimit(req, scope, limit, windowMs);

    // If you want to include the rate headers on successful responses too,
    // you can return them from your route and set these headers there.
    // We intentionally return null here to keep the helper non-invasive.
    void headers;

    return null;
  } catch (e) {
    const err = e as RateLimitError;
    const status = Number(err.status) || 429;
    const message = err.message || "Too many requests";

    const hdrs = new Headers();
    if (err.headers) {
      for (const [k, v] of Object.entries(err.headers)) hdrs.set(k, String(v));
    }
    hdrs.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

    return NextResponse.json({ error: message }, { status, headers: hdrs });
  }
}
