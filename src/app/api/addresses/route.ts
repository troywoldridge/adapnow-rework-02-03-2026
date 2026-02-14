import "server-only";

import { NextResponse } from "next/server";
import { listAddresses, createAddress } from "@/lib/addresses";
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

export async function GET() {
  try {
    const rows = await listAddresses();
    return NextResponse.json({ addresses: rows });
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonError(500, "Failed to list addresses");
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (!body || typeof body !== "object") {
      return jsonError(400, "Invalid JSON body");
    }

    // Validate required address fields
    const normalized = requireValidAddress(
      {
        label: body.label ?? null,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        company: body.company ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        street1: body.street1 ?? null,
        street2: body.street2 ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        postalCode: body.postalCode ?? null,
        country: body.country ?? null,
      },
      { kind: body.kind === "billing" ? "billing" : "shipping" },
    );

    const row = await createAddress({
      label: normalized.label,
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      company: normalized.company,
      email: normalized.email,
      phone: normalized.phone, // plaintext allowed here; lib encrypts into phone_enc/last4

      street1: normalized.street1,
      street2: normalized.street2,
      city: normalized.city,
      state: normalized.state,
      postalCode: normalized.postalCode,
      country: normalized.country,

      isDefaultShipping: body.isDefaultShipping === true,
      isDefaultBilling: body.isDefaultBilling === true,

      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      metadata: body.metadata ?? undefined,
    });

    return NextResponse.json({ address: row }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;

    const msg = err instanceof Error ? err.message : "";
    // If validation threw "field: message", return a 422
    if (msg.includes(":")) return jsonError(422, msg);

    return jsonError(500, "Failed to create address");
  }
}
