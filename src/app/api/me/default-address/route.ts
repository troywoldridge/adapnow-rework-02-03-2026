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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const id = norm(req.cookies.get(COOKIE_NAME)?.value);
  if (!id) return noStore(NextResponse.json({ ok: true, address: null }, { status: 200 }));

  const row = await db.query.customerAddresses.findFirst({
    where: and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, userId)),
  });

  return noStore(NextResponse.json({ ok: true, address: row ?? null }, { status: 200 }));
}
