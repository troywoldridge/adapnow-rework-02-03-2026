import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

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

function toCountry(v: unknown): "US" | "CA" | string {
  const raw = typeof v === "string" ? v.trim() : "";
  return raw || "US";
}

function toNullableString(v: unknown): string | null {
  if (v === null) return null;
  const s = asString(v);
  return s;
}

type AddressCreateInput = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
};

function sanitizeCreate(body: any): AddressCreateInput | { error: string } {
  const name = asString(body?.name);
  const line1 = asString(body?.line1);
  const city = asString(body?.city);
  const state = asString(body?.state);
  const postalCode = asString(body?.postalCode);

  if (!name) return { error: "missing_name" };
  if (!line1) return { error: "missing_line1" };
  if (!city) return { error: "missing_city" };
  if (!state) return { error: "missing_state" };
  if (!postalCode) return { error: "missing_postalCode" };

  const line2 = toNullableString(body?.line2);
  const phone = toNullableString(body?.phone);
  const country = toCountry(body?.country);
  const isDefault = Boolean(body?.isDefault);

  return { name, line1, line2, city, state, postalCode, country, phone, isDefault };
}

/**
 * GET /api/me/addresses
 * Returns all addresses for the authenticated user.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    const rows = await db.select().from(addresses).where(eq(addresses.userId, userId));

    const defaultAddress = rows.find((a: any) => Boolean(a?.isDefault)) ?? null;

    return NextResponse.json({
      ok: true,
      addresses: rows,
      defaultAddressId: (defaultAddress as any)?.id ?? null,
    });
  } catch (e: any) {
    console.error("GET /api/me/addresses failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/**
 * POST /api/me/addresses
 * Creates a new address for the authenticated user.
 * If isDefault=true, clears other defaults first (transaction).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const parsed = sanitizeCreate(body);
    if ("error" in parsed) return jsonError(400, parsed.error);

    const created = await db.transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx
          .update(addresses)
          .set({ isDefault: false })
          .where(eq(addresses.userId, userId));
      }

      // Insert: keep it plain/compatible across drivers.
      const inserted = await tx
        .insert(addresses as any)
        .values({
          userId,
          name: parsed.name,
          line1: parsed.line1,
          line2: parsed.line2,
          city: parsed.city,
          state: parsed.state,
          postalCode: parsed.postalCode,
          country: parsed.country,
          phone: parsed.phone,
          isDefault: parsed.isDefault,
        })
        .returning();

      return (inserted as any[])?.[0] ?? null;
    });

    const rows = await db.select().from(addresses).where(eq(addresses.userId, userId));
    const defaultAddress = rows.find((a: any) => Boolean(a?.isDefault)) ?? null;

    return NextResponse.json({
      ok: true,
      address: created,
      addresses: rows,
      defaultAddressId: (defaultAddress as any)?.id ?? null,
    });
  } catch (e: any) {
    console.error("POST /api/me/addresses failed", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}
