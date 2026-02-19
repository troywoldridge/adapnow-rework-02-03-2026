import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getAddressById, updateAddress, deleteAddress } from "@/lib/addresses";
import { requireValidAddress } from "@/lib/addressValidation";
import { ApiError } from "@/lib/apiError";
import { enforcePolicy } from "@/lib/auth";
import { handleAddressApiError } from "../errorHandling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

async function requireUserId(req: NextRequest): Promise<string> {
  const auth = await enforcePolicy(req, "auth");
  if (!auth.userId) throw new ApiError(401, "Unauthorized");
  return auth.userId;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const row = await getAddressById(String(id || ""), userId);
    return row ? noStoreJson({ ok: true, address: row }) : noStoreJson({ ok: false, error: "Address not found" }, 404);
  } catch (error: unknown) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return noStoreJson({ ok: false, error: "Unauthorized" }, 401);
    }
    return noStoreJson({ ok: false, error: "Failed to load address" }, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return noStoreJson({ ok: false, error: "Invalid JSON" }, 400);

    const existing = await getAddressById(String(id || ""), userId);
    if (!existing) return noStoreJson({ ok: false, error: "Address not found" }, 404);

    if (["street1", "city", "state", "postalCode", "country"].some((k) => k in body)) {
      requireValidAddress({
        label: (body.label as string | null | undefined) ?? existing.label ?? null,
        firstName: (body.firstName as string | null | undefined) ?? existing.firstName ?? null,
        lastName: (body.lastName as string | null | undefined) ?? existing.lastName ?? null,
        company: (body.company as string | null | undefined) ?? existing.company ?? null,
        email: (body.email as string | null | undefined) ?? existing.email ?? null,
        phone: (body.phone as string | null | undefined) ?? null,
        street1: (body.street1 as string | null | undefined) ?? existing.street1 ?? null,
        street2: (body.street2 as string | null | undefined) ?? existing.street2 ?? null,
        city: (body.city as string | null | undefined) ?? existing.city ?? null,
        state: (body.state as string | null | undefined) ?? existing.state ?? null,
        postalCode: (body.postalCode as string | null | undefined) ?? existing.postalCode ?? null,
        country: (body.country as string | null | undefined) ?? existing.country ?? null,
      });
    }

    const payload: any = {
      customerId: userId,
      ...("label" in body ? { label: body.label } : {}),
      ...("firstName" in body ? { firstName: body.firstName } : {}),
      ...("lastName" in body ? { lastName: body.lastName } : {}),
      ...("company" in body ? { company: body.company } : {}),
      ...("email" in body ? { email: body.email } : {}),
      ...("phone" in body ? { phone: body.phone } : {}),
      ...("street1" in body ? { street1: body.street1 } : {}),
      ...("street2" in body ? { street2: body.street2 } : {}),
      ...("city" in body ? { city: body.city } : {}),
      ...("state" in body ? { state: body.state } : {}),
      ...("postalCode" in body ? { postalCode: body.postalCode } : {}),
      ...("country" in body ? { country: body.country } : {}),
      ...("isDefaultShipping" in body ? { isDefaultShipping: body.isDefaultShipping === true } : {}),
      ...("isDefaultBilling" in body ? { isDefaultBilling: body.isDefaultBilling === true } : {}),
      ...("sortOrder" in body ? { sortOrder: body.sortOrder } : {}),
      ...("metadata" in body ? { metadata: body.metadata } : {}),
    };

    const updated = await updateAddress(String(id || ""), payload);
    return updated
      ? noStoreJson({ ok: true, address: updated })
      : noStoreJson({ ok: false, error: "Address not found" }, 404);
  } catch (error: unknown) {
    const response = handleAddressApiError(error, "Failed to update address");
    return noStoreJson(response.body, response.status);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    await deleteAddress(String(id || ""), userId);
    return noStoreJson({ ok: true });
  } catch (error: unknown) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return noStoreJson({ ok: false, error: "Unauthorized" }, 401);
    }
    return noStoreJson({ ok: false, error: "Failed to delete address" }, 500);
  }
}
