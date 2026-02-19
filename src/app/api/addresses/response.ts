import { NextResponse } from "next/server";

import { ApiError } from "@/lib/apiError";

const noStoreHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };

export function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export function handleAddressApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { body: { ok: false, error: "Unauthorized" }, status: 401 };
    }
    if (error.status === 422) {
      return { body: { ok: false, error: error.message, details: error.details }, status: 422 };
    }
    return { body: { ok: false, error: error.message }, status: error.status };
  }

  return { body: { ok: false, error: fallbackMessage }, status: 500 };
}
