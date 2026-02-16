import "server-only";

import { NextResponse } from "next/server";
import { auth, currentUser, clerkClient as rawClerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Normalize clerkClient across Clerk versions (some export an object, some a function).
 */
async function getClerk() {
  const anyClient: any = rawClerkClient as any;
  return typeof anyClient === "function" ? await anyClient() : anyClient;
}

type Me = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  avatarCfId: string | null;
};

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string") {
      const s = v.trim();
      if (s) return s;
    }
  }
  return "";
}

function toMe(userId: string, user: any): Me {
  const email = firstNonEmpty(
    user?.primaryEmailAddress?.emailAddress,
    user?.emailAddresses?.[0]?.emailAddress
  );

  return {
    userId,
    firstName: firstNonEmpty(user?.firstName),
    lastName: firstNonEmpty(user?.lastName),
    email,
    company: firstNonEmpty(user?.publicMetadata?.company),
    avatarCfId:
      typeof user?.publicMetadata?.avatarCfId === "string" && user.publicMetadata.avatarCfId.trim()
        ? user.publicMetadata.avatarCfId.trim()
        : null,
  };
}

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

function noStoreJson(payload: unknown, init?: number | ResponseInit) {
  const base: ResponseInit =
    typeof init === "number" ? { status: init } : init ? init : { status: 200 };
  const headers = new Headers(base.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload as any, { ...base, headers });
}

function clampString(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function isProbablyCfImageId(v: string): boolean {
  // Cloudflare Images ID is typically a UUID; allow UUID-ish only (safe + predictable).
  // If you use non-UUID IDs, loosen this.
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** GET /api/me — return current user profile */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    // Fast path
    const meUser = await currentUser();
    if (meUser) return noStoreJson({ ok: true, me: toMe(userId, meUser) });

    // Fallback via clerkClient
    const cc = await getClerk();
    const user = await cc.users.getUser(userId);
    return noStoreJson({ ok: true, me: toMe(userId, user) });
  } catch (e: any) {
    console.error("/api/me GET failed:", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

/**
 * PUT /api/me — update first/last/company and optional avatarCfId
 *
 * Body:
 *  { firstName?: string, lastName?: string, company?: string, avatarCfId?: string|null }
 *
 * Notes:
 *  - firstName/lastName update root Clerk fields
 *  - company/avatarCfId stored in publicMetadata
 *  - avatarCfId accepts UUID-ish strings; pass null/"" to clear
 */
export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return jsonError(401, "unauthorized");

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const firstName = clampString(body?.firstName, 80);
    const lastName = clampString(body?.lastName, 80);
    const company = clampString(body?.company, 120);

    let avatarCfId: string | null | undefined = undefined;
    if (body?.avatarCfId === null) {
      avatarCfId = null;
    } else if (typeof body?.avatarCfId === "string") {
      const s = body.avatarCfId.trim();
      if (!s) avatarCfId = null; // treat empty as clear
      else avatarCfId = isProbablyCfImageId(s) ? s : undefined;
    }

    // If avatarCfId provided but invalid, reject explicitly.
    if (typeof body?.avatarCfId === "string") {
      const s = body.avatarCfId.trim();
      if (s && avatarCfId === undefined) {
        return jsonError(400, "invalid_avatarCfId");
      }
    }

    const update: any = {};

    if (firstName !== null) update.firstName = firstName; // "" allowed (clears)
    if (lastName !== null) update.lastName = lastName;

    const publicMetadata: Record<string, any> = {};
    if (company !== null) publicMetadata.company = company; // "" allowed
    if (avatarCfId !== undefined) publicMetadata.avatarCfId = avatarCfId;

    if (Object.keys(publicMetadata).length) update.publicMetadata = publicMetadata;

    if (Object.keys(update).length === 0) {
      return jsonError(400, "no_fields_to_update");
    }

    const cc = await getClerk();
    await cc.users.updateUser(userId, update);

    // Prefer refetch from Clerk for a fresh view (metadata merges etc).
    const refreshed = await cc.users.getUser(userId);
    return noStoreJson({ ok: true, me: toMe(userId, refreshed) });
  } catch (e: any) {
    console.error("/api/me PUT failed:", e);
    return jsonError(500, "internal_error", { detail: String(e?.message || e) });
  }
}

// Guard other methods (optional but keeps things tidy)
export async function POST() {
  return jsonError(405, "method_not_allowed");
}
export const DELETE = POST;
