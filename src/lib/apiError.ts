// src/lib/apiError.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";

export type ApiErrorBody = {
  ok: false;
  error: string;
  code?: string;
  requestId?: string;
  // allow additional fields when needed (productId, storeCode, etc.)
  [key: string]: unknown;
};

/**
 * Try to get a stable request ID:
 * - Prefer incoming headers (reverse proxy / client)
 * - Otherwise generate a lightweight random id
 */
export function getRequestId(req: NextRequest): string {
  const hdr =
    req.headers.get("x-request-id") ||
    req.headers.get("x-amzn-trace-id") ||
    req.headers.get("cf-ray") ||
    req.headers.get("x-vercel-id");

  if (hdr && hdr.trim()) return hdr.trim();

  // node runtime: use crypto.randomUUID when available
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require("crypto") as typeof import("crypto");
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // ignore
  }

  // fallback: timestamp + random
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Standard JSON error response helper.
 * `extra` can include any additional fields you want (productId, storeCode, details, etc.)
 */
export function jsonError(
  status: number,
  message: string,
  extra: Omit<ApiErrorBody, "ok" | "error"> = {},
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    ok: false,
    error: message,
    ...extra,
  };
  return NextResponse.json(body, { status });
}
