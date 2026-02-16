// src/app/api/sessions/ensure/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/sessions/ensure
 *
 * Purpose:
 * - Guarantee a stable anonymous session id ("sid") stored in cookies.
 * - Keep legacy cookie names ("adap_sid" and "sid") aligned.
 * - Ensure there is always an OPEN cart bound to this sid.
 *
 * Future-proofing:
 * - No module-top env reads that can break builds.
 * - Works across Next versions where cookies() may be sync or async.
 * - Stable response envelope with requestId.
 */

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
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

async function getJar() {
  // Next cookies() has been sync historically but can be "thenable" in some runtimes.
  const maybe: any = cookies();
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function ensureOpenCartForSid(sid: string) {
  // Prefer a standard query shape that works in both Drizzle query API styles.
  const existing =
    (await db
      .select()
      .from(carts)
      .where(and(eq(carts.sid, sid), eq(carts.status as any, "open")))
      .limit(1)) ?? [];

  if (existing[0]) return;

  await db.insert(carts).values({
    sid,
    status: "open" as any,
    currency: "USD" as any, // default; add-to-cart/pricing can overwrite for CA
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
  } as any);
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  // We create a response early so we can attach cookies, then reuse headers.
  let res = NextResponse.json(
    { ok: true as const, requestId },
    { status: 200, headers: { "x-request-id": requestId } }
  );

  try {
    const jar = await getJar();

    let sid: string | undefined =
      jar.get?.("adap_sid")?.value ?? jar.get?.("sid")?.value ?? undefined;

    if (!sid || !String(sid).trim()) {
      sid = crypto.randomUUID();
    }

    // Always refresh/align both cookie names
    res.cookies.set("adap_sid", sid, COOKIE_OPTS);
    res.cookies.set("sid", sid, COOKIE_OPTS);

    // Ensure there is an open cart for this sid
    await ensureOpenCartForSid(sid);

    // Return the sid in body too (useful for debugging and non-cookie clients)
    res = NextResponse.json(
      { ok: true as const, requestId, sid },
      { status: 200, headers: res.headers }
    );

    return noStore(res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return noStore(
      NextResponse.json(
        { ok: false as const, requestId, error: message || "session_ensure_failed" },
        {
          status: 500,
          headers: {
            "x-request-id": requestId,
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
          },
        }
      )
    );
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStore(
    NextResponse.json(
      { ok: false as const, requestId, error: "Method not allowed. Use POST." },
      { status: 405, headers: { "x-request-id": requestId } }
    )
  );
}
