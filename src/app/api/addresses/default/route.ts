import "server-only";

import { NextRequest } from "next/server";

import { setDefaultAddress } from "@/lib/addresses";
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

export async function PUT(req: NextRequest) {
  const requestId = getRequestIdFromHeaders(req.headers);
  const log = withRequestId(requestId);

  const POLICY = "auth" as const;

  try {
    const auth = await enforcePolicy(req, POLICY);

    const body = await readJson<any>(req);
    if (!body || typeof body !== "object") {
      throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "Invalid JSON (expected application/json)" });
    }

    const kind = body.kind === "billing" ? "billing" : body.kind === "shipping" ? "shipping" : null;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!kind) {
      throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "kind must be 'shipping' or 'billing'" });
    }
    if (!id) {
      throw new ApiError({ status: 400, code: "BAD_REQUEST", message: "id is required" });
    }

    await setDefaultAddress(kind, id, auth.userId);

    const res = ok({ ok: true }, { requestId: auth.requestId });
    return withNoStore(res);
  } catch (e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      logAuthzDenial({ req, policy: POLICY, requestId, reason: e.message });
    }

    const msg = e instanceof Error ? e.message : "Failed to set default address";
    log.error("Set default address failed", { message: msg, requestId });

    const res = fail(e, { requestId });
    return withNoStore(res);
  }
}
