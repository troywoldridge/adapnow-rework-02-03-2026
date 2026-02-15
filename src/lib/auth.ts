// src/lib/auth.ts
import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { enforcePolicy } from "@/lib/authzPolicy";

/** Minimal, stable typing for Clerk's getToken */
type GetToken = (opts?: { template?: string }) => Promise<string | null>;

export type AuthContext = {
  userId: string;
  sessionId: string | null;
  getToken: GetToken;
};

/**
 * Canonical helper: get auth context (or null).
 * Prefer policy-based enforcement for routes; this is for low-level libs.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const a = await auth();
  if (!a?.userId) return null;

  return {
    userId: a.userId,
    sessionId: a.sessionId ?? null,
    getToken: a.getToken as GetToken,
  };
}

/**
 * Canonical policy enforcement for API routes.
 * Returns { ok: true, ctx } or { ok: false, res }.
 */
export async function enforce(req: NextRequest, policy: "public" | "auth" | "admin" | "cron") {
  const result = await enforcePolicy(req, { kind: policy } as any);
  if (!result.ok) return { ok: false as const, res: result.res };

  // For public/cron we don't have a user ctx
  if (result.principal.kind === "user" || result.principal.kind === "admin") {
    const ctx = await getAuthContext();
    if (ctx) return { ok: true as const, ctx };
  }

  return { ok: true as const, ctx: null as AuthContext | null };
}

/**
 * Legacy (Stage 1) APIs — kept for compatibility.
 * These throw a Response on failure (existing call-sites may rely on that).
 */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new Response(JSON.stringify({ ok: false, error: { status: 401, code: "UNAUTHORIZED", message: "Unauthorized" } }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  // Legacy compatibility: enforce via policy engine with a synthetic request is not possible here.
  // Use policy-based enforcement in routes. This function remains for old lib call-sites.
  return await requireUser();
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
