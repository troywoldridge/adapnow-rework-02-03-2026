import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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

function norm(v: unknown) {
  return String(v ?? "").trim();
}

const AddressUpdateSchema = z
  .object({
    label: z.string().trim().max(80).optional(),
    name: z.string().trim().max(120).optional(),
    company: z.string().trim().max(120).optional(),
    street1: z.string().trim().min(1).max(200).optional(),
    street2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(1).max(80).optional(),
    postal: z.string().trim().min(1).max(40).optional(),
    country: z.string().trim().min(2).max(2).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .strict();

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const { id } = await ctx.params; // ✅ Next 15 params are async
  const addressId = norm(id);
  if (!addressId) return noStore(NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 }));

  const row = await db.query.customerAddresses.findFirst({
    where: and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, userId)),
  });

  if (!row) return noStore(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }));
  return noStore(NextResponse.json({ ok: true, address: row }, { status: 200 }));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const { id } = await ctx.params;
  const addressId = norm(id);
  if (!addressId) return noStore(NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 }));

  const raw = await req.json().catch(() => null);
  const parsed = AddressUpdateSchema.safeParse(raw);
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
  const patch: Record<string, any> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "undefined") continue;
    patch[k] = val === "" ? null : val;
  }

  if (Object.keys(patch).length === 0) {
    return noStore(NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 }));
  }

  const [updated] = await db
    .update(customerAddresses)
    .set({ ...patch, updatedAt: new Date() } as any)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, userId)))
    .returning();

  if (!updated) return noStore(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }));
  return noStore(NextResponse.json({ ok: true, address: updated }, { status: 200 }));
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));

  const { id } = await ctx.params;
  const addressId = norm(id);
  if (!addressId) return noStore(NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 }));

  const [deleted] = await db
    .delete(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, userId)))
    .returning({ id: customerAddresses.id });

  if (!deleted) return noStore(NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }));
  return noStore(NextResponse.json({ ok: true, id: deleted.id }, { status: 200 }));
}
