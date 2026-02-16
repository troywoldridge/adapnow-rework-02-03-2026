// src/app/api/send-order-confirmation/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendEmail } from "@/lib/sendEmail";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/send-order-confirmation
 *
 * Future-proof goals:
 * - Stable response envelope: { ok, requestId, ... }
 * - Validation with Zod.
 * - Optional authorization:
 *   - If the caller is signed in, only allow sending for their own order.
 *   - If not signed in, allow only if order belongs to current guest sid cookie.
 * - Idempotency-friendly: if you later add an email_outbox pipeline, this route can enqueue instead.
 *
 * Note:
 * - This route uses sendEmail() directly because that's what you have now.
 * - If you're using the email_outbox/email_deliveries pipeline elsewhere, we can swap to enqueue logic next.
 */

function getRequestId(req: NextRequest): string {
  const existing = req.headers.get("x-request-id");
  if (existing && existing.trim()) return existing.trim();
  try {
    return crypto.randomUUID();
  } catch {
    return `rid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function errMsg(e: unknown, fallback = "Unexpected error") {
  return e instanceof Error ? (e.message || fallback) : fallback;
}

const BodySchema = z
  .object({
    to: z.string().email(),
    orderId: z.union([z.string().min(1), z.number()]).transform(String),
  })
  .strict();

function readSidFromCookie(req: NextRequest): string | null {
  // We don’t use next/headers cookies() here because this route may be called
  // in contexts where you want to forward cookies explicitly.
  const cookie = req.headers.get("cookie") || "";
  const m1 = cookie.match(/(?:^|;\s*)adap_sid=([^;]+)/);
  const m2 = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  const raw = m1?.[1] || m2?.[1] || "";
  try {
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return raw || null;
  }
}

function renderHtml(orderId: string) {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4">
      <h1 style="margin:0 0 12px 0">Thank you for your order!</h1>
      <p style="margin:0 0 10px 0">Your order <b>#${orderId}</b> has been received.</p>
      <p style="margin:0">We’ll send updates as your order moves through production and shipping.</p>
    </div>
  `.trim();
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false as const,
          requestId,
          error: "Invalid request",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 422, headers: { "x-request-id": requestId } }
      );
    }

    const { to, orderId } = parsed.data;

    // Authorization: must own the order either by Clerk userId or by guest sid.
    // If you truly want this endpoint to be "admin-only" or "cron-only", we can
    // swap this logic to your policy/secret guard instead.
    const { userId } = await auth();
    const sid = readSidFromCookie(req);

    const [o] =
      (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)) ?? [];

    if (!o) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "order_not_found" },
        { status: 404, headers: { "x-request-id": requestId } }
      );
    }

    const owner = String((o as any)?.userId ?? "");
    const allowedOwners = [userId, sid].filter((x): x is string => Boolean(x && x.trim()));
    if (!allowedOwners.includes(owner)) {
      return NextResponse.json(
        { ok: false as const, requestId, error: "forbidden" },
        { status: 403, headers: { "x-request-id": requestId } }
      );
    }

    const subject = `Order Confirmation #${orderId}`;
    const html = renderHtml(orderId);

    await sendEmail({ to, subject, html });

    return NextResponse.json(
      { ok: true as const, requestId },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (e: unknown) {
    console.error("send-order-confirmation failed:", e);
    return NextResponse.json(
      { ok: false as const, requestId, error: errMsg(e) },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}

async function methodNotAllowed(req: NextRequest) {
  const requestId = getRequestId(req);
  return NextResponse.json(
    { ok: false as const, requestId, error: "Method Not Allowed" },
    { status: 405, headers: { "x-request-id": requestId } }
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
