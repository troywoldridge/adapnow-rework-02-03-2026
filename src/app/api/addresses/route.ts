import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { listAddresses, createAddress } from "@/lib/addresses";
import { requireValidAddress } from "@/lib/addressValidation";
import { apiError } from "@/lib/apiError";
import { getRequestId } from "@/lib/requestId";
import { withRequestId } from "@/lib/logger";
import { enforcePolicy } from "@/lib/authzPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    pragma: "no-cache",
    expires: "0",
  } as const;
}

function jsonOk(requestId: string, extra?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true as const, requestId, ...(extra || {}) }, { status, headers: noStoreHeaders() });
}

function jsonErr(status: number, code: string, message: string, requestId: string, details?: unknown) {
  return NextResponse.json(apiError(status, code, message, { requestId, details }), {
    status,
    headers: noStoreHeaders(),
  });
}

async function readJson(req: NextRequest): Promise<any | null> {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  const guard = await enforcePolicy(req, { kind: "auth" });
  if (!guard.ok) return guard.res;

  try {
    const rows = await listAddresses();
    return jsonOk(requestId, { addresses: rows }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list addresses";
    log.error("List addresses failed", { message, requestId });
    return jsonErr(500, "INTERNAL_ERROR", "Failed to list addresses", requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  const guard = await enforcePolicy(req, { kind: "auth" });
  if (!guard.ok) return guard.res;

  const body = await readJson(req);
  if (!body || typeof body !== "object") {
    return jsonErr(400, "BAD_REQUEST", "Invalid JSON body (expected application/json)", requestId);
  }

  try {
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
      phone: normalized.phone,

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

    return jsonOk(requestId, { address: row }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";

    // Address validation typically throws field-ish messages; treat as 422.
    if (msg && msg.includes(":")) {
      return jsonErr(422, "VALIDATION_ERROR", msg, requestId);
    }

    log.error("Create address failed", { message: msg || "Failed to create address", requestId });
    return jsonErr(500, "INTERNAL_ERROR", "Failed to create address", requestId);
  }
}
