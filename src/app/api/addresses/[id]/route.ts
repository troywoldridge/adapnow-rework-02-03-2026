import "server-only";

import { NextRequest } from "next/server";

import { getAddressById, updateAddress, deleteAddress } from "@/lib/addresses";
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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const log = withRequestId(requestId);

  const POLICY = "auth" as const;

  try {
    const auth = await enforcePolicy(req, POLICY);

    const { id } = await ctx.params;

    // NOTE: lib layer should enforce customer scoping
    const row = await getAddressById(id, auth.userId);
    if (!row) throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Address not found" });

    const res = ok({ address: row }, { requestId: auth.requestId });
    return withNoStore(res);
  } catch (e: unknown) {
    // Only log authz denials as authz
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({ req, policy: POLICY, requestId, reason: e.message });
    }

    const msg = e instanceof Error ? e.message : "Failed to get address";
    log.error("Get address failed", { message: msg, requestId });

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const log = withRequestId(requestId);

  const POLICY = "auth" as const;

  try {
    const auth = await enforcePolicy(req, POLICY);

    const { id } = await ctx.params;

    const body = await readJson<any>(req);
    if (!body || typeof body !== "object") {
      throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "Invalid JSON (expected application/json)" });
    }

    const existing = await getAddressById(id, auth.userId);
    if (!existing) throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Address not found" });

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

      requireValidAddress(merged, { kind: body.kind === "billing" ? "billing" : "shipping" });
    }

    const updated = await updateAddress(id, {
      customerId: auth.userId,

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

    if (!updated) throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Address not found" });

    const res = ok({ address: updated }, { requestId: auth.requestId });
    return withNoStore(res);
  } catch (e: unknown) {
    // Preserve old behavior: "field: message" -> 422 (but keep Stage 2 envelope)
    const msg = e instanceof Error ? e.message : "";
    if (msg && msg.includes(":")) {
      const res = fail(new ApiError({ status: 422, code: "BAD_REQUEST", message: msg }), { requestId });
      return withNoStore(res);
    }

    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({ req, policy: POLICY, requestId, reason: e.message });
    }

    log.error("Update address failed", { message: msg || "Failed to update address", requestId });

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const log = withRequestId(requestId);

  const POLICY = "auth" as const;

  try {
    const auth = await enforcePolicy(req, POLICY);

    const { id } = await ctx.params;

    await deleteAddress(id, auth.userId);

    const res = ok({ ok: true }, { requestId: auth.requestId });
    return withNoStore(res);
  } catch (e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({ req, policy: POLICY, requestId, reason: e.message });
    }

    const msg = e instanceof Error ? e.message : "Failed to delete address";
    log.error("Delete address failed", { message: msg, requestId });

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}
