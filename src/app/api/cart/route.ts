// src/app/api/cart/route.ts
import "server-only";

import { NextRequest } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

async function absOrigin(req: NextRequest): Promise<string> {
  // Prefer env for PROD, but in dev use the incoming request’s origin
  const envOrigin =
    process.env.PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";

  return envOrigin || req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const origin = await absOrigin(req);
  const target = new URL("/api/cart/current", origin).toString();

  // Forward cookies so /api/cart/current sees the same session
  const jar = await getJar();
  const cookieHeader = jar
    .getAll()
    .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
    .join("; ");

  // Add a short timeout so we don't hang if something goes sideways
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);

  try {
    const res = await fetch(target, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        cookie: cookieHeader,
      },
      signal: ac.signal,
    });

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const json = await res.json();
      return Response.json(json, {
        status: res.status,
        headers: noStoreHeaders(),
      });
    }

    // Not JSON? Stream it through as-is.
    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "fetch failed";
    return Response.json({ ok: false, error: msg }, { status: 502, headers: noStoreHeaders() });
  } finally {
    clearTimeout(t);
  }
}
