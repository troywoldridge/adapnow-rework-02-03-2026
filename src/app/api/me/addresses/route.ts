import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { customerAddresses } from "@/lib/db/schema/customerAddresses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

const AddressCreateSchema = z
  .object({
    street1: z.string().trim().min(1).max(200),
    street2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(80),
    postalCode: z.string().trim().min(1).max(40),
    country: z.string().trim().min(2).max(2).default("US"),
  })
  .strict();

export async function GET() {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const rows = await db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, userId))
    .orderBy(desc(customerAddresses.createdAt));

  return noStore(NextResponse.json({ ok: true, addresses: rows }, { status: 200 }));
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const raw = await req.json().catch(() => null);
  const parsed = AddressCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return noStore(
      NextResponse.json(
        {
          ok: false,
          error: "invalid_body",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 }
      )
    );
  }

  const v = parsed.data;

  const insertRow: typeof customerAddresses.$inferInsert = {
    customerId: userId,
    street1: v.street1,
    ...(v.street2 ? { street2: v.street2 } : {}),
    city: v.city,
    state: v.state,
    postalCode: v.postalCode,
    country: v.country,
  };

  const [row] = await db.insert(customerAddresses).values(insertRow).returning();

  return noStore(NextResponse.json({ ok: true, address: row }, { status: 201 }));
}
