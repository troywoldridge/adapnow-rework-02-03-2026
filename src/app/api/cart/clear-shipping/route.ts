import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { carts } from "@/lib/db/schema/cart";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST() {
  const database = db;

  try {
    const sid = cookies().get("sid")?.value ?? "";
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
