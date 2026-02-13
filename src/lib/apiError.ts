// src/lib/apiError.ts
// Consistent API error responses with optional requestId.

import { NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  "content-type": "application/json; charset=utf-8",
} as const;

export type ApiErrorBody = {
  ok: false;
  error: string;
  code?: string;
  requestId?: string;
};

/**
 * Build a standard JSON error response.
 */
export function jsonError(
  status: number,
  message: string,
  options?: { code?: string; requestId?: string }
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    ok: false,
    error: message,
    ...(options?.code && { code: options.code }),
    ...(options?.requestId && { requestId: options.requestId }),
  };
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: NO_STORE_HEADERS,
  });
}

/** Generate a request ID from header or random. */
export function getRequestId(req: { headers?: { get?: (name: string) => string | null } }): string {
  const fromHeader = req?.headers?.get?.("x-request-id");
  if (fromHeader && typeof fromHeader === "string" && fromHeader.trim()) {
    return fromHeader.trim();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
