import "server-only";

import { NextRequest } from "next/server";

import { listAddresses, createAddress } from "@/lib/addresses";
import { requireValidAddress } from "@/lib/addressValidation";
import { ApiError, ok, fail, getRequestIdFromHeaders, readJson } from "@/lib/apiError";
import { withRequestId } from "@/lib/logger";
import { enforcePolicy, logAuthzDenial } from "@/lib/auth";

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

function withNoStore(res: Response) {
  const hs = noStoreHeaders();
  for (const [k, v] of Object.entries(hs)) (res as any).headers?.set?.(k, v);
  return res;
}

export async function GET(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const log = withRequestId(requestId);

  const POLICY = "auth" as const;

  try {
    const auth = await enforcePolicy(req, POLICY);

    // Scoped to authenticated customer
    const rows = await listAddresses(auth.userId);

    const res = ok({ addresses: rows }, { requestId: auth.requestId });
    return withNoStore(res);
  } catch (e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({ req, policy: POLICY, requestId, reason: e.message });
    }

    const msg = e instanceof Error ? e.message : "Failed to list addresses";
    log.error("List addresses failed", { message: msg, requestId });

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const log = withRequestId(requestId);

  const POLICY = "auth" as const;

  try {
    const auth = await enforcePolicy(req, POLICY);

    const body = await readJson<any>(req);
    if (!body || typeof body !== "object") {
      throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "Invalid JSON (expected application/json)" });
    }

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
      customerId: auth.userId,

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

    const res = ok({ address: row }, { requestId: auth.requestId, status: 201 });
    return withNoStore(res);
  } catch (e: unknown) {
    // Preserve old behavior: "field: message" -> 422
    const msg = e instanceof Error ? e.message : "";
    if (msg && msg.includes(":")) {
      const res = fail(new ApiError({ status: 422, code: "BAD_REQUEST", message: msg }), { requestId });
      return withNoStore(res);
    }

    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({ req, policy: POLICY, requestId, reason: e.message });
    }

    log.error("Create address failed", { message: msg || "Failed to create address", requestId });

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}
