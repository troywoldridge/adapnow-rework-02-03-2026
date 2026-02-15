// src/lib/requestId.ts
import "server-only";

import type { NextRequest } from "next/server";

/**
 * Request ID helper used by API routes and tests.
 * Prefer upstream headers; fall back to random UUID.
 */
export function getRequestId(req: NextRequest): string {
  const h = req.headers;

  const incoming =
    h.get("x-request-id") ||
    h.get("cf-ray") ||
    h.get("x-amzn-trace-id") ||
    h.get("x-vercel-id") ||
    "";

  if (incoming && incoming.trim()) return incoming.trim();

  // Node 18+/22: crypto.randomUUID exists
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
