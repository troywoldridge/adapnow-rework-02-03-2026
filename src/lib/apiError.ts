// src/lib/apiError.ts
// Canonical API error envelope helpers (Stage 2).
import "server-only";

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiErrorShape = {
  ok: false;
  error: {
    status: number;
    code: ApiErrorCode | string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};

export function apiError(
  status: number,
  code: ApiErrorCode | string,
  message: string,
  opts?: { requestId?: string; details?: unknown },
): ApiErrorShape {
  return {
    ok: false,
    error: {
      status,
      code,
      message,
      requestId: opts?.requestId,
      details: opts?.details ?? null,
    },
  };
}

/**
 * Canonical NextResponse JSON error.
 * Prefer this in route handlers.
 */
export function jsonError(
  status: number,
  message: string,
  opts?: { code?: ApiErrorCode | string; requestId?: string; details?: unknown },
) {
  const code =
    opts?.code ??
    (status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : status === 409
              ? "CONFLICT"
              : status === 422
                ? "VALIDATION_ERROR"
                : status === 429
                  ? "RATE_LIMITED"
                  : "INTERNAL_ERROR");

  return NextResponse.json(apiError(status, code, message, { requestId: opts?.requestId, details: opts?.details }), {
    status,
  });
}

// Common alias exports (helps older call-sites if you had them)
export const apiErrorResponse = apiError;
export default apiError;
