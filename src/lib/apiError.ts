import "server-only";

import { NextResponse } from "next/server";

export type ApiFailShape = {
  ok: false;
  error: string;
  code?: string;
  requestId?: string;
  details?: unknown;
};

export type ApiOkShape<T> = {
  ok: true;
  requestId?: string;
} & T;

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, opts?: { code?: string; details?: unknown });
  constructor(input: { status: number; message: string; code?: string; details?: unknown });
  constructor(
    a: number | { status: number; message: string; code?: string; details?: unknown },
    b?: string,
    c?: { code?: string; details?: unknown },
  ) {
    if (typeof a === "number") {
      super(b || "API Error");
      this.status = a;
      this.code = c?.code;
      this.details = c?.details;
    } else {
      super(a.message);
      this.status = a.status;
      this.code = a.code;
      this.details = a.details;
    }
    this.name = "ApiError";
  }
}

export function getRequestIdFromHeaders(req: Request): string | undefined {
  const v = req.headers.get("x-request-id");
  return v && v.trim() ? v.trim() : undefined;
}

export function getRequestId(req: Request): string | undefined {
  return getRequestIdFromHeaders(req);
}

export async function readJson<T = any>(req: Request): Promise<T> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json");
  }
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

export function ok<T extends Record<string, any>>(data: T, init?: ResponseInit) {
  const body: ApiOkShape<T> = { ok: true, ...data };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export function fail(
  error: string | unknown,
  init?: { status?: number; code?: string; requestId?: string; details?: unknown },
) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "Request failed";
  const body: ApiFailShape = {
    ok: false,
    error: message,
    code: init?.code,
    requestId: init?.requestId,
    details: init?.details,
  };
  return NextResponse.json(body, { status: init?.status ?? 400 });
}

export function jsonError(status: number, message: string, meta?: Record<string, unknown>) {
  const body: ApiFailShape = {
    ok: false,
    error: message,
    ...(meta ?? {}),
  } as any;
  return NextResponse.json(body, { status });
}

export function apiError(status: number, message: string, meta?: Record<string, unknown>) {
  return jsonError(status, message, meta);
}
