import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function getSidFromRequest(req: NextRequest): string {
  return req.cookies.get("sid")?.value ?? req.cookies.get("adap_sid")?.value ?? "";
}

export async function POST(req: NextRequest) {
  const database = db;

  try {
    const sid = getSidFromRequest(req);
    if (!sid) return json(400, { ok: false, error: "No session/cart." });

    const cart = await database.query.carts.findFirst({
      where: and(eq(carts.sid, sid), ne(carts.status, "closed")),
    });

    if (!cart) return json(404, { ok: false, error: "Cart not found." });

    await database
      .update(carts)
      .set({ selectedShipping: null, updatedAt: new Date() })
      .where(eq(carts.id, cart.id));

    return json(200, { ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { ok: false, error: msg || "Unknown error" });
  }
}
