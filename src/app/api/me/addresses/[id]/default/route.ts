import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { addresses } from "@/lib/db/schema/addresses"; // adjust path/name to yours

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status }
  );
}

/**
 * POST /api/me/addresses/[id]/default
 * Sets the given address (must belong to the authed user) as the default address.
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    const addressId = String(ctx?.params?.id ?? "").trim();
    if (!addressId) return jsonError(400, "missing_address_id");

    // Transaction prevents racing requests from leaving multiple defaults.
    await db.transaction(async (tx) => {
      // Clear default for this user
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, userId));

      // Set requested address as default ONLY if it belongs to this user.
      const res = await tx
        .update(addresses)
        .set({ isDefault: true })
        .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId)));

      // Drizzle update return varies by driver; best-effort check.
      const updatedRows =
        typeof (res as any)?.rowCount === "number" ? (res as any).rowCount : null;

      if (updatedRows === 0) {
        // Address not found or not owned by user.
        throw Object.assign(new Error("address_not_found"), { code: "address_not_found" });
      }
    });

    // Return updated list for UI refresh
    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId));

    const defaultAddress = rows.find((a: any) => Boolean(a?.isDefault)) ?? null;

    return NextResponse.json({
      ok: true,
      addresses: rows,
      defaultAddressId: (defaultAddress as any)?.id ?? null,
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");

    if (code === "address_not_found" || msg === "address_not_found") {
      return jsonError(404, "address_not_found");
    }

    console.error("set default address failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}
