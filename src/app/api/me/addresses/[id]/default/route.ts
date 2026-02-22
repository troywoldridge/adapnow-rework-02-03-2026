import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { customerAddresses } from "@/lib/db/schema/customerAddresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COOKIE_NAME = "adap_default_address_id";

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function norm(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const { id } = await ctx.params; // ✅ fix Promise params
  const addressId = norm(id);
  if (!addressId) return noStore(NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 }));

  // Ensure the address belongs to this user
  const row = await db.query.customerAddresses.findFirst({
    where: and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, userId)),
    columns: { id: true },
  });

  if (!row) return noStore(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }));

  const res = NextResponse.json({ ok: true, defaultAddressId: addressId }, { status: 200 });
  res.cookies.set(COOKIE_NAME, addressId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  return noStore(res);
}
