import "server-only";

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | (string & {});

export type ApiErrorEnvelope = {
  ok: false;
  requestId?: string;
  error: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiOkEnvelope<T extends Record<string, unknown> = Record<string, unknown>> = {
  ok: true;
  requestId?: string;
} & T;

/**
 * apiError(): consistent ok=false envelope for API responses.
 * This is used directly by older routes and is expected by unit tests.
 */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  opts?: { requestId?: string; details?: unknown },
): ApiErrorEnvelope {
  return {
    ok: false,
    requestId: opts?.requestId,
    error: {
      status,
      code,
      message,
      ...(typeof opts?.details !== "undefined" ? { details: opts.details } : {}),
    },
  };
}

/**
 * Structured error type used throughout server routes.
 */
export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;
  requestId?: string;

  constructor(args: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
    this.requestId = args.requestId;
  }
}

/**
 * Extract requestId from headers. Used by routes that don't rely on middleware.
 */
export function getRequestIdFromHeaders(h: Headers): string {
  const candidates = [
    "x-request-id",
    "x-vercel-id",
    "cf-ray",
    "x-correlation-id",
    "x-amzn-trace-id",
  ];
  for (const k of candidates) {
    const v = (h.get(k) || "").trim();
    if (v) return v;
  }
  // Stable fallback (not cryptographically random, but fine for correlation)
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * ok(): consistent ok=true envelope
 */
export function ok<T extends Record<string, unknown>>(
  payload: T,
  opts?: { requestId?: string },
): NextResponse<ApiOkEnvelope<T>> {
  const requestId = opts?.requestId;
  return NextResponse.json({ ok: true as const, ...(requestId ? { requestId } : {}), ...payload });
}

/**
 * fail(): convert unknown errors into a consistent ok=false envelope
 */
export function fail(
  err: unknown,
  opts?: { requestId?: string },
): NextResponse<ApiErrorEnvelope> {
  const fallbackRequestId = opts?.requestId;

  if (err instanceof ApiError) {
    const rid = err.requestId || fallbackRequestId;
    return NextResponse.json(apiError(err.status, err.code, err.message, { requestId: rid, details: err.details }), {
      status: err.status,
    });
  }

  // If someone threw a Response, let it pass through at call sites.
  // (Call sites usually handle this before calling fail, but we keep it safe.)
  if (err instanceof Response) {
    // Not ideal to wrap a Response; return a generic internal error envelope instead.
    return NextResponse.json(apiError(500, "INTERNAL_ERROR", "Unexpected Response thrown", { requestId: fallbackRequestId }), {
      status: 500,
    });
  }

  const message = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json(apiError(500, "INTERNAL_ERROR", message, { requestId: fallbackRequestId }), {
    status: 500,
  });
}

/**
 * readJson(): safe JSON reader (returns null if not json or invalid)
 * Call sites decide whether to throw BAD_REQUEST.
 */
export async function readJson<T = any>(req: Request): Promise<T | null> {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
