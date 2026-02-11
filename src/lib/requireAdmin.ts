// src/lib/requireAdmin.ts
import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

type HttpStatus = 401 | 403;

function jsonError(status: HttpStatus, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

let _allowset: Set<string> | null = null;

function getAdminAllowset(): Set<string> {
  if (_allowset) return _allowset;

  const raw = String(process.env.ADMIN_EMAILS ?? "");
  const emails = raw
    .split(/[,\s;]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  _allowset = new Set(emails);
  return _allowset;
}

function isEmailAllowlisted(userEmails: string[]): boolean {
  const allow = getAdminAllowset();
  if (!allow.size || !userEmails.length) return false;
  return userEmails.some((e) => allow.has(e.trim().toLowerCase()));
}

/**
 * Simple admin gate:
 * 1) Clerk publicMetadata.role === "admin"
 * 2) OR user email is in env ADMIN_EMAILS (comma/space/semicolon separated)
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const { userId } = await auth();
  if (!userId) {
    throw jsonError(401, "Unauthorized");
  }

  const user = await currentUser();
  if (!user || user.id !== userId) {
    // Extremely defensive: mismatch means no trust
    throw jsonError(401, "Unauthorized");
  }

  const role = String((user.publicMetadata?.role as string | undefined) ?? "")
    .trim()
    .toLowerCase();

  const isAdminByRole = role === "admin";

  const userEmails = (user.emailAddresses ?? [])
    .map((x) => x.emailAddress)
    .filter(Boolean)
    .map((e) => e.toLowerCase());

  const isAdminByEmail = isEmailAllowlisted(userEmails);

  if (!isAdminByRole && !isAdminByEmail) {
    throw jsonError(403, "Forbidden");
  }

  return { userId };
}
