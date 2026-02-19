import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { listAddresses, createAddress } from "@/lib/addresses";
import { requireValidAddress } from "@/lib/addressValidation";
import { ApiError } from "@/lib/apiError";
import { enforcePolicy } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}

async function userIdFor(req: NextRequest): Promise<string | null> {
  try {
    const auth = await enforcePolicy(req, "auth");
    return auth.userId ?? null;
  } catch (error: unknown) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await userIdFor(req);
    if (!userId) return noStoreJson({ ok: false, error: "Unauthorized" }, 401);

    const rows = await listAddresses(userId);
    return noStoreJson({ ok: true, addresses: rows });
  } catch {
    return noStoreJson({ ok: false, error: "Failed to list addresses" }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await userIdFor(req);
    if (!userId) return noStoreJson({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return noStoreJson({ ok: false, error: "Invalid JSON" }, 400);

    requireValidAddress(
      {
        label: (body.label as string | null | undefined) ?? null,
        firstName: (body.firstName as string | null | undefined) ?? null,
        lastName: (body.lastName as string | null | undefined) ?? null,
        company: (body.company as string | null | undefined) ?? null,
        email: (body.email as string | null | undefined) ?? null,
        phone: (body.phone as string | null | undefined) ?? null,
        street1: (body.street1 as string | null | undefined) ?? null,
        street2: (body.street2 as string | null | undefined) ?? null,
        city: (body.city as string | null | undefined) ?? null,
        state: (body.state as string | null | undefined) ?? null,
        postalCode: (body.postalCode as string | null | undefined) ?? null,
        country: (body.country as string | null | undefined) ?? null,
      },
      { kind: body.isDefaultBilling === true ? "billing" : "shipping" },
    );

    const created = await createAddress({ customerId: userId, ...(body as any) });
    return noStoreJson({ ok: true, address: created }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        return noStoreJson({ ok: false, error: "Unauthorized" }, 401);
      }
      if (error.status === 422) {
        return noStoreJson({ ok: false, error: error.message, details: error.details }, 422);
      }
      return noStoreJson({ ok: false, error: error.message }, error.status);
    }
    return noStoreJson({ ok: false, error: "Failed to create address" }, 500);
  }
}
