// src/lib/getOrSetSid.ts
import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const COOKIE_NAME = "adap_sid";
const LEGACY_COOKIE_NAMES = ["sid"] as const;

export type CookieOpts = {
  /**
   * If provided, we will set the cookie on this response
   * so the browser actually stores it.
   */
  res?: NextResponse;

  /**
   * Force secure flag; defaults to true in production.
   * (In local dev over http, this should be false.)
   */
  secure?: boolean;

  /**
   * Override max age (seconds). Default: 30 days.
   */
  maxAgeSeconds?: number;

  /**
   * Also set legacy cookie names (like "sid") for compatibility during rebuild.
   * Default: true (so old code keeps working).
   */
  mirrorLegacy?: boolean;
};

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

// Next 14 (sync) + Next 15 (async) cookies()
async function getCookieJar(): Promise<any> {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function normalizeSid(v: unknown): string {
  return String(v ?? "").trim();
}

function computeCookieConfig(opts: CookieOpts) {
  const secure = opts.secure ?? isProd();
  const maxAge = Number.isFinite(Number(opts.maxAgeSeconds))
    ? Math.max(60, Math.trunc(Number(opts.maxAgeSeconds)))
    : DEFAULT_MAX_AGE;

  return { secure, maxAge };
}

function setSidCookie(res: NextResponse, name: string, sid: string, opts: CookieOpts) {
  const { secure, maxAge } = computeCookieConfig(opts);
  res.cookies.set(name, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge,
  });
}

function setSidOnResponse(res: NextResponse, sid: string, opts: CookieOpts) {
  // Always set the canonical cookie
  setSidCookie(res, COOKIE_NAME, sid, opts);

  // Optionally mirror legacy cookie names for a transition period
  const mirror = opts.mirrorLegacy ?? true;
  if (mirror) {
    for (const legacy of LEGACY_COOKIE_NAMES) {
      setSidCookie(res, legacy, sid, opts);
    }
  }
}

/**
 * Read-only helper:
 * Returns the current SID from request cookies or null if missing.
 * Reads canonical first, then legacy fallbacks.
 */
export async function getSidSafe(): Promise<string | null> {
  const jar = await getCookieJar();

  const primary = normalizeSid(jar?.get?.(COOKIE_NAME)?.value);
  if (primary) return primary;

  for (const legacy of LEGACY_COOKIE_NAMES) {
    const v = normalizeSid(jar?.get?.(legacy)?.value);
    if (v) return v;
  }

  return null;
}

/**
 * Ensures you have a session id.
 * - Reads from request cookies (supports Next 14 sync and Next 15 async cookies()).
 * - If missing, generates one.
 * - If opts.res is provided, writes the cookie on that response (canonical + optional legacy mirror).
 */
export async function getOrEnsureSid(opts: CookieOpts = {}): Promise<string> {
  const jar = await getCookieJar();

  // Prefer canonical
  let sid = normalizeSid(jar?.get?.(COOKIE_NAME)?.value);

  // Fallback legacy
  if (!sid) {
    for (const legacy of LEGACY_COOKIE_NAMES) {
      sid = normalizeSid(jar?.get?.(legacy)?.value);
      if (sid) break;
    }
  }

  // Create if missing
  if (!sid) {
    sid = crypto.randomUUID();
    if (opts.res) setSidOnResponse(opts.res, sid, opts);
    return sid;
  }

  // Optionally mirror onto response (idempotent) so it persists on the client
  if (opts.res) setSidOnResponse(opts.res, sid, opts);

  return sid;
}

// Back-compat so older imports keep compiling
export const getOrSetSid = getOrEnsureSid;
