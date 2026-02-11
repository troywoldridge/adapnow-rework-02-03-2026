// src/lib/auth.ts
import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

/** Minimal, stable typing for Clerk's getToken */
type GetToken = (opts?: { template?: string }) => Promise<string | null>;

export type AuthContext = {
  userId: string;
  sessionId: string | null;
  getToken: GetToken;
};

type HttpStatus = 401 | 403;

function jsonError(status: HttpStatus, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function truthyEnv(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

let _adminEmailAllowset: Set<string> | null = null;
function getAdminEmailAllowset(): Set<string> {
  if (_adminEmailAllowset) return _adminEmailAllowset;

  const raw = String(process.env.ADMIN_EMAILS ?? "");
  const allow = raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  _adminEmailAllowset = new Set(allow);
  return _adminEmailAllowset;
}

/** Allowlist helper for quick bootstrap/admin access */
function isEmailAllowlisted(userEmails: string[] = []): boolean {
  const allow = getAdminEmailAllowset();
  if (!allow.size || !userEmails.length) return false;

  return userEmails.some((em) => allow.has(String(em).trim().toLowerCase()));
}

/**
 * Decide if current request's user is an admin.
 * Uses: publicMetadata.role === "admin" OR ADMIN_EMAILS allowlist.
 */
async function isAdminForCurrentRequest(expectedUserId: string): Promise<boolean> {
  const user = await currentUser();
  if (!user || user.id !== expectedUserId) return false;

  const role = String((user.publicMetadata?.role as string | undefined) ?? "")
    .trim()
    .toLowerCase();

  if (role === "admin") return true;

  const emails = (user.emailAddresses ?? []).map((e) => e.emailAddress);
  if (isEmailAllowlisted(emails)) return true;

  // If you use Organizations and want org-admins to count, reintroduce clerkClient here.
  return false;
}

export async function requireUser(): Promise<AuthContext> {
  const a = await auth();
  if (!a?.userId) {
    throw jsonError(401, "Unauthorized");
  }

  return {
    userId: a.userId,
    sessionId: a.sessionId ?? null,
    getToken: a.getToken as GetToken,
  };
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();

  // Escape hatch for local/dev or temporary ops needs
  if (truthyEnv(process.env.ALLOW_ALL_ADMINS)) {
    return ctx;
  }

  const ok = await isAdminForCurrentRequest(ctx.userId);
  if (!ok) {
    throw jsonError(403, "Forbidden");
  }

  return ctx;
}

/** Convenience helpers */
export async function requireUserId(): Promise<string> {
  const { userId } = await requireUser();
  return userId;
}

export async function requireAdminId(): Promise<string> {
  const { userId } = await requireAdmin();
  return userId;
}
