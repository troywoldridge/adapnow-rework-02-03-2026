// src/app/api/cart/shipping/choose/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Next 14 (sync) + Next 15 (async)
async function getJar() {
  const maybe = cookies() as any;
  return typeof maybe?.then === "function" ? await maybe : maybe;
}

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      country?: "US" | "CA";
      state?: string;
      zip?: string;
      carrier?: string;
      method?: string;
      cost?: number;
      days?: number | null;
      currency?: "USD" | "CAD";
    };

    const jar = await getJar();
    const sid = jar.get?.("sid")?.value ?? jar.get?.("adap_sid")?.value ?? "";
    if (!sid) return noStore(NextResponse.json({ ok: false, error: "No session" }, { status: 401 }));

    const [cart] =
      (await db
        .select({ id: carts.id })
        .from(carts)
        .where(and(eq(carts.sid, sid), ne(carts.status, "closed")))
        .limit(1)) ?? [];

    if (!cart) return noStore(NextResponse.json({ ok: false, error: "Cart not found" }, { status: 404 }));

    const payload = {
      carrier: norm(body.carrier),
      method: norm(body.method),
      cost: Math.max(0, num(body.cost, 0)),
      days: body.days == null ? null : Math.max(0, Math.floor(num(body.days, 0))),
      currency: body.currency === "CAD" ? "CAD" : "USD",
      country: body.country === "CA" ? "CA" : "US",
      state: norm(body.state),
      zip: norm(body.zip),
    };

    // Require carrier + method so we don't store junk
    if (!payload.carrier || !payload.method) {
      return noStore(
        NextResponse.json({ ok: false, error: "Missing carrier/method" }, { status: 400 }),
      );
    }

    await db.update(carts).set({ selectedShipping: payload as any }).where(eq(carts.id, cart.id));

    return noStore(NextResponse.json({ ok: true, selected: payload }, { status: 200 }));
  } catch (err: any) {
    return noStore(
      NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 }),
    );
  }
}
