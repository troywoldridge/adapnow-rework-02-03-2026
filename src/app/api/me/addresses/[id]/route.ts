import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { addresses } from "@/lib/db/schema/addresses"; // adjust path/name to yours

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

type AddressPatch = {
  name?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string | null;
  isDefault?: boolean;
};

function sanitizePatch(body: any): AddressPatch {
  const patch: AddressPatch = {};

  const name = asString(body?.name);
  if (name !== null) patch.name = name;

  const line1 = asString(body?.line1);
  if (line1 !== null) patch.line1 = line1;

  // allow null to clear
  if (body?.line2 === null) patch.line2 = null;
  else {
    const line2 = asString(body?.line2);
    if (line2 !== null) patch.line2 = line2;
  }

  const city = asString(body?.city);
  if (city !== null) patch.city = city;

  const state = asString(body?.state);
  if (state !== null) patch.state = state;

  const postalCode = asString(body?.postalCode);
  if (postalCode !== null) patch.postalCode = postalCode;

  const country = asString(body?.country);
  if (country !== null) patch.country = country;

  // allow null to clear
  if (body?.phone === null) patch.phone = null;
  else {
    const phone = asString(body?.phone);
    if (phone !== null) patch.phone = phone;
  }

  const isDefault = asBool(body?.isDefault);
  if (isDefault !== null) patch.isDefault = isDefault;

  return patch;
}

/**
 * GET /api/me/addresses/[id]
 * Returns a single address (must belong to the authed user).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    const id = String(ctx?.params?.id ?? "").trim();
    if (!id) return jsonError(400, "missing_address_id");

    const rows = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));

    const row = rows[0] ?? null;
    if (!row) return jsonError(404, "address_not_found");

    return NextResponse.json({ ok: true, address: row });
  } catch (e: any) {
    console.error("GET /api/me/addresses/[id] failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/**
 * PATCH /api/me/addresses/[id]
 * Updates a single address (must belong to the authed user).
 * If isDefault=true, it will clear other defaults first (transaction).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    const id = String(ctx?.params?.id ?? "").trim();
    if (!id) return jsonError(400, "missing_address_id");

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const patch = sanitizePatch(body);
    if (Object.keys(patch).length === 0) return jsonError(400, "no_fields_to_update");

    await db.transaction(async (tx) => {
      // If setting default, clear any existing default(s) first.
      if (patch.isDefault === true) {
        await tx
          .update(addresses)
          .set({ isDefault: false })
          .where(eq(addresses.userId, userId));
      }

      // Never allow changing ownership via patch
      const { isDefault, ...rest } = patch;
      const updateSet: Record<string, unknown> = { ...rest };
      if (typeof isDefault === "boolean") updateSet.isDefault = isDefault;

      const res = await tx
        .update(addresses)
        .set(updateSet as any)
        .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));

      const updatedRows =
        typeof (res as any)?.rowCount === "number" ? (res as any).rowCount : null;

      if (updatedRows === 0) {
        throw Object.assign(new Error("address_not_found"), { code: "address_not_found" });
      }
    });

    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId));

    const updated = rows.find((r: any) => String(r?.id) === id) ?? null;

    return NextResponse.json({
      ok: true,
      address: updated,
      addresses: rows,
      defaultAddressId: (rows.find((a: any) => Boolean(a?.isDefault)) as any)?.id ?? null,
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");
    if (code === "address_not_found" || msg === "address_not_found") {
      return jsonError(404, "address_not_found");
    }

    console.error("PATCH /api/me/addresses/[id] failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/**
 * DELETE /api/me/addresses/[id]
 * Deletes a single address (must belong to the authed user).
 * If the deleted address was default, this does NOT auto-pick a new default (UI can choose).
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    const id = String(ctx?.params?.id ?? "").trim();
    if (!id) return jsonError(400, "missing_address_id");

    // (Optional) read first so we can return a nicer 404
    const existing = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));

    if (!existing[0]) return jsonError(404, "address_not_found");

    await db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));

    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId));

    return NextResponse.json({
      ok: true,
      deletedId: id,
      addresses: rows,
      defaultAddressId: (rows.find((a: any) => Boolean(a?.isDefault)) as any)?.id ?? null,
    });
  } catch (e: any) {
    console.error("DELETE /api/me/addresses/[id] failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}
