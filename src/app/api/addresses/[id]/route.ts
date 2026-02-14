import "server-only";

import { NextResponse } from "next/server";
import { getAddressById, updateAddress, deleteAddress } from "@/lib/addresses";
import { requireValidAddress } from "@/lib/addressValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const row = await getAddressById(id);
    if (!row) return jsonError(404, "Address not found");

    return NextResponse.json({ address: row });
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Failed to get address");
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await readJson(req);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    const existing = await getAddressById(id);
    if (!existing) return jsonError(404, "Address not found");

    // If any core address fields are being updated, validate merged result.
    const touchesCore =
      "street1" in body ||
      "city" in body ||
      "state" in body ||
      "postalCode" in body ||
      "country" in body;

    if (touchesCore) {
      const merged = {
        label: ("label" in body ? body.label : existing.label) ?? null,
        firstName: ("firstName" in body ? body.firstName : existing.firstName) ?? null,
        lastName: ("lastName" in body ? body.lastName : existing.lastName) ?? null,
        company: ("company" in body ? body.company : existing.company) ?? null,
        email: ("email" in body ? body.email : existing.email) ?? null,
        // phone is plaintext only in input; stored encrypted in DB.
        phone: ("phone" in body ? body.phone : null) ?? null,
        street1: ("street1" in body ? body.street1 : existing.street1) ?? null,
        street2: ("street2" in body ? body.street2 : existing.street2) ?? null,
        city: ("city" in body ? body.city : existing.city) ?? null,
        state: ("state" in body ? body.state : existing.state) ?? null,
        postalCode: ("postalCode" in body ? body.postalCode : existing.postalCode) ?? null,
        country: ("country" in body ? body.country : existing.country) ?? null,
      };

      // Validate merged. (kind only affects optional stricter rules)
      requireValidAddress(merged, { kind: body.kind === "billing" ? "billing" : "shipping" });
    }

    const updated = await updateAddress(id, {
      ...(typeof body.label !== "undefined" ? { label: body.label } : {}),
      ...(typeof body.firstName !== "undefined" ? { firstName: body.firstName } : {}),
      ...(typeof body.lastName !== "undefined" ? { lastName: body.lastName } : {}),
      ...(typeof body.company !== "undefined" ? { company: body.company } : {}),
      ...(typeof body.email !== "undefined" ? { email: body.email } : {}),
      ...(typeof body.phone !== "undefined" ? { phone: body.phone } : {}),

      ...(typeof body.street1 !== "undefined" ? { street1: body.street1 } : {}),
      ...(typeof body.street2 !== "undefined" ? { street2: body.street2 } : {}),
      ...(typeof body.city !== "undefined" ? { city: body.city } : {}),
      ...(typeof body.state !== "undefined" ? { state: body.state } : {}),
      ...(typeof body.postalCode !== "undefined" ? { postalCode: body.postalCode } : {}),
      ...(typeof body.country !== "undefined" ? { country: body.country } : {}),

      ...(typeof body.isDefaultShipping !== "undefined"
        ? { isDefaultShipping: body.isDefaultShipping === true }
        : {}),
      ...(typeof body.isDefaultBilling !== "undefined"
        ? { isDefaultBilling: body.isDefaultBilling === true }
        : {}),

      ...(typeof body.sortOrder !== "undefined" ? { sortOrder: body.sortOrder } : {}),
      ...(typeof body.metadata !== "undefined" ? { metadata: body.metadata } : {}),
    });

    if (!updated) return jsonError(404, "Address not found");

    return NextResponse.json({ address: updated });
  } catch (err) {
    if (err instanceof Response) return err;

    const msg = err instanceof Error ? err.message : "";
    if (msg.includes(":")) return jsonError(422, msg);

    return jsonError(500, "Failed to update address");
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    await deleteAddress(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Failed to delete address");
  }
}
