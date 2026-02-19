import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { setDefaultAddress } from "@/lib/addresses";
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

export async function PUT(req: NextRequest) {
  try {
    const auth = await enforcePolicy(req, "auth");
    if (!auth.userId) return noStoreJson({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => null)) as { kind?: string; id?: string } | null;
    const kind = body?.kind === "billing" ? "billing" : body?.kind === "shipping" ? "shipping" : null;
    const id = String(body?.id || "").trim();

    if (!kind || !id) {
      return noStoreJson({ ok: false, error: "Missing or invalid kind/id" }, 400);
    }

    await setDefaultAddress(kind, id, auth.userId);
    return noStoreJson({ ok: true });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        return noStoreJson({ ok: false, error: "Unauthorized" }, 401);
      }
      return noStoreJson({ ok: false, error: error.message }, error.status);
    }
    return noStoreJson({ ok: false, error: "Failed to set default address" }, 500);
  }
}
