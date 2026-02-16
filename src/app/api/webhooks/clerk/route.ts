// src/app/api/webhooks/clerk/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { Webhook } from "svix";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Clerk Webhook
 *
 * POST /api/webhooks/clerk
 *
 * Verifies Svix headers:
 * - svix-id
 * - svix-timestamp
 * - svix-signature
 *
 * Handles:
 * - user.created
 * - user.updated
 * - user.deleted
 *
 * Sync behavior:
 * - Upserts a row into customers where customers.clerkUserId == Clerk user id
 * - Saves email when available
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

function noStoreJson(req: NextRequest, body: any, status = 200) {
  const requestId = body?.requestId || getRequestId(req);
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function readWebhookSecret(): string | null {
  const s = String(process.env.CLERK_WEBHOOK_SECRET || "").trim();
  return s ? s : null;
}

function cleanEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!s.includes("@") || s.startsWith("@") || s.endsWith("@")) return null;
  if (s.length > 320) return null;
  return s;
}

const ClerkEventSchema = z.object({
  type: z.string(),
  data: z.any(),
});

function extractUserIdAndEmail(evt: any): { userId: string | null; email: string | null } {
  const data = evt?.data ?? {};
  const userId = typeof data?.id === "string" ? data.id : null;

  const primaryEmailId = data?.primary_email_address_id;
  const emails = Array.isArray(data?.email_addresses) ? data.email_addresses : [];
  let email: string | null = null;

  // Prefer primary email
  if (primaryEmailId) {
    const found = emails.find((e: any) => e?.id === primaryEmailId);
    email = cleanEmail(found?.email_address) || null;
  }

  // fallback: first email
  if (!email && emails.length) {
    email = cleanEmail(emails[0]?.email_address) || null;
  }

  return { userId, email };
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  try {
    const secret = readWebhookSecret();
    if (!secret) {
      // Don't hard-crash deploys; but this is a real config error.
      console.error("Missing env: CLERK_WEBHOOK_SECRET");
      return noStoreJson(req, { ok: false as const, requestId, error: "missing_webhook_secret" }, 500);
    }

    const svixId = req.headers.get("svix-id");
    const svixTs = req.headers.get("svix-timestamp");
    const svixSig = req.headers.get("svix-signature");

    if (!svixId || !svixTs || !svixSig) {
      return noStoreJson(req, { ok: false as const, requestId, error: "missing_svix_headers" }, 400);
    }

    // IMPORTANT: we must use the raw body exactly as received
    const payload = await req.text();

    let evt: any;
    try {
      const wh = new Webhook(secret);
      evt = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTs,
        "svix-signature": svixSig,
      });
    } catch (e: any) {
      console.error("Clerk webhook signature verification failed", e?.message || e);
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_signature" }, 401);
    }

    const parsed = ClerkEventSchema.safeParse(evt);
    if (!parsed.success) {
      return noStoreJson(req, { ok: false as const, requestId, error: "invalid_event_shape" }, 400);
    }

    const type = parsed.data.type;

    // Only handle the events we care about (ignore the rest safely)
    if (type !== "user.created" && type !== "user.updated" && type !== "user.deleted") {
      return noStoreJson(req, { ok: true as const, requestId, ignored: true, type }, 200);
    }

    const { userId, email } = extractUserIdAndEmail(parsed.data);
    if (!userId) {
      return noStoreJson(req, { ok: false as const, requestId, error: "missing_user_id" }, 400);
    }

    if (type === "user.deleted") {
      // keep historical customers row; just remove linkage email optionally
      await db
        .update(customers)
        .set({ clerkUserId: null as any, updatedAt: new Date() as any } as any)
        .where(eq(customers.clerkUserId, userId));

      return noStoreJson(req, { ok: true as const, requestId, type }, 200);
    }

    // user.created / user.updated -> upsert-ish behavior
    const existing =
      (await db.select().from(customers).where(eq(customers.clerkUserId, userId)).limit(1))?.[0] ?? null;

    if (!existing) {
      // create row (requires email)
      const safeEmail = email;
      if (!safeEmail) {
        // create minimal row if your schema allows; otherwise just ack webhook
        console.warn("Clerk webhook: no email available on create; skipping customer insert");
        return noStoreJson(req, { ok: true as const, requestId, type, skipped: "no_email" }, 200);
      }

      await db
        .insert(customers)
        .values({
          clerkUserId: userId,
          email: safeEmail,
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
        } as any);

      return noStoreJson(req, { ok: true as const, requestId, type, created: true }, 200);
    }

    // update email if present and different
    if (email && String((existing as any).email || "").toLowerCase() !== email.toLowerCase()) {
      await db
        .update(customers)
        .set({ email, updatedAt: new Date() as any } as any)
        .where(eq(customers.id, (existing as any).id));
    } else {
      // touch updatedAt for visibility
      await db
        .update(customers)
        .set({ updatedAt: new Date() as any } as any)
        .where(eq(customers.id, (existing as any).id));
    }

    return noStoreJson(req, { ok: true as const, requestId, type, updated: true }, 200);
  } catch (e: any) {
    console.error("[/api/webhooks/clerk POST] failed", e?.message || e);
    return noStoreJson(req, { ok: false as const, requestId, error: String(e?.message || e) }, 500);
  }
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  return noStoreJson(req, { ok: false as const, requestId, error: "Method Not Allowed" }, 405);
}
