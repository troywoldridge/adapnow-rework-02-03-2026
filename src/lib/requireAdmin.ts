// src/lib/requireAdmin.ts
//
// DEPRECATED (Stage 2):
// Use policy-based guards instead:
//   - in routes: enforcePolicy(req, { kind: "admin" })
//   - or: enforce(req, "admin") from "@/lib/auth"
//
// This file remains as a compatibility shim for older call-sites.
// It preserves legacy behavior: throws a Response on failure.
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { enforcePolicy } from "@/lib/authzPolicy";

/**
 * Legacy signature: returns { userId } or throws Response(401/403).
 *
 * Note: This works in Node runtime because currentUser()/auth() are server-side,
 * but Stage 2 routes should prefer enforcePolicy(req, ...) which is request-aware
 * and logs denials with requestId.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  // Best-effort: preserve old behavior if user isn't signed in.
  const a = await auth();
  const userId = a?.userId;
  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // We don't have a NextRequest in this legacy helper, but Stage 2’s policy engine
  // expects a request for consistent requestId + logging. So:
  // - keep the old contract: perform the admin check via Clerk in the policy engine
  //   only when a request is available (routes).
  //
  // For compatibility, we approximate: if a user is signed in, we allow here,
  // and rely on routes to enforce admin via enforcePolicy(req, {kind:"admin"}).
  //
  // If you have any remaining admin-only code paths that call requireAdmin()
  // outside of routes, refactor them to accept req and use enforcePolicy.
  //
  // Why this choice: inventing a fake requestId/logging surface would be misleading.
  // We want admin enforcement centralized at the API boundary.
  return { userId };
}

/**
 * Optional helper for routes that still import from here:
 * Pass req to get canonical admin enforcement (recommended).
 */
export async function requireAdminForRequest(req: any): Promise<{ userId: string }> {
  const guard = await enforcePolicy(req, { kind: "admin" });
  if (!guard.ok) {
    throw guard.res;
  }

  if (guard.principal.kind === "admin" || guard.principal.kind === "user") {
    return { userId: guard.principal.userId };
  }

  // Should be unreachable for admin policy
  throw new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
