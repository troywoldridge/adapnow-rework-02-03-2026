import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { addresses } from "@/lib/db/schema/addresses"; // adjust path/name to yours

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

export async function GET() {
  const { userId } = await auth(); // await required
  if (!userId) return jsonError(401, "unauthorized");

  try {
    // Prefer explicit default, scoped to the authed user.
    const rows = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));

    const addr = rows[0] ?? null;

    return NextResponse.json({ ok: true, addr });
  } catch (e: any) {
    console.error("GET /api/me/default-address failed", e);
    return jsonError(500, "internal_error", {
      detail: String(e?.message || e || "Failed to load default address"),
    });
  }
}

// Guard other methods
export async function POST() {
  return jsonError(405, "method_not_allowed");
}
export const PUT = POST;
export const DELETE = POST;
