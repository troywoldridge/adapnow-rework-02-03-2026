// src/app/api/price/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

const replacement = "/api/price/pricing";
const message =
  "Deprecated endpoint. Use POST /api/price/pricing with { productId, store, quantity, optionIds }.";

function payload(method?: string) {
  return {
    ok: false,
    deprecated: true,
    status: 410,
    method: method ?? null,
    error: message,
    replacement,
    example: {
      method: "POST",
      path: replacement,
      body: { productId: 123, store: "US", quantity: 100, optionIds: [1, 2, 3] },
    },
  };
}

export async function GET() {
  return noStoreJson(payload("GET"), 410);
}

export async function POST() {
  return noStoreJson(payload("POST"), 410);
}

// Nice-to-have: explicit preflight support
export async function OPTIONS(_req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Allow: "GET, POST, OPTIONS",
    },
  });
}

// Guard everything else
export async function PUT() {
  return noStoreJson(payload("PUT"), 410);
}
export async function PATCH() {
  return noStoreJson(payload("PATCH"), 410);
}
export async function DELETE() {
  return noStoreJson(payload("DELETE"), 410);
}
