import "server-only";

import { NextResponse } from "next/server";

export function noStoreHeaders() {
  return { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };
}

export function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: noStoreHeaders() });
}

export function ok(body: unknown = { ok: true }) {
  return json(200, body);
}

export function badRequest(error: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error, ...(extra ?? {}) });
}

export function unauthorized(extra?: Record<string, unknown>) {
  return json(401, { ok: false, error: "unauthorized", ...(extra ?? {}) });
}

export function forbidden(extra?: Record<string, unknown>) {
  return json(403, { ok: false, error: "forbidden", ...(extra ?? {}) });
}

export function notFound(error = "not_found", extra?: Record<string, unknown>) {
  return json(404, { ok: false, error, ...(extra ?? {}) });
}

export function serverError(error: string, extra?: Record<string, unknown>) {
  return json(500, { ok: false, error, ...(extra ?? {}) });
}
