import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { auth, currentUser } from "@clerk/nextjs/server";

import { apiError } from "@/lib/apiError";
import { getRequestId } from "@/lib/requestId";
import { withRequestId } from "@/lib/logger";

export type RoutePolicy =
  | { kind: "public" }
  | { kind: "auth" }
  | { kind: "admin" }
  | { kind: "cron" };

export type Principal =
  | { kind: "anonymous" }
  | { kind: "user"; userId: string; sessionId: string | null; email?: string | null }
  | { kind: "admin"; userId: string; sessionId: string | null; email?: string | null }
  | { kind: "cron" };

type GuardOk = { ok: true; principal: Principal };
type GuardNo = { ok: false; res: Response };

export type GuardResult = GuardOk | GuardNo;

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

function isEmailAllowlisted(userEmails: string[] = []): boolean {
  const allow = getAdminEmailAllowset();
  if (!allow.size || !userEmails.length) return false;

  return userEmails.some((em) => allow.has(String(em).trim().toLowerCase()));
}

/** Constant-time secret compare (avoid timing leaks). */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) {
    const max = Math.max(aBuf.length, bBuf.length, 1);
    const aPad = Buffer.concat([aBuf, Buffer.alloc(max - aBuf.length)]);
    const bPad = Buffer.concat([bBuf, Buffer.alloc(max - bBuf.length)]);
    timingSafeEqual(aPad, bPad);
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

async function getClerkPrincipal(): Promise<Principal | null> {
  const a = await auth();
  if (!a?.userId) return null;

  // Best-effort email (helpful for logs)
  let email: string | null = null;
  try {
    const u = await currentUser();
    if (u && u.id === a.userId) {
      email = (u.emailAddresses ?? [])[0]?.emailAddress ?? null;
    }
  } catch {
    // ignore
  }

  return {
    kind: "user",
    userId: a.userId,
    sessionId: a.sessionId ?? null,
    email,
  };
}

async function isAdminForCurrentRequest(expectedUserId: string): Promise<boolean> {
  // Escape hatch for local/dev or temporary ops needs
  if (truthyEnv(process.env.ALLOW_ALL_ADMINS)) return true;

  const user = await currentUser();
  if (!user || user.id !== expectedUserId) return false;

  const role = String((user.publicMetadata?.role as string | undefined) ?? "")
    .trim()
    .toLowerCase();

  if (role === "admin") return true;

  const emails = (user.emailAddresses ?? []).map((e) => e.emailAddress);
  if (isEmailAllowlisted(emails)) return true;

  return false;
}

function deny(
  req: NextRequest,
  status: 401 | 403,
  code: string,
  message: string,
  meta?: Record<string, unknown>,
): GuardNo {
  const requestId = getRequestId(req);
  const log = withRequestId(requestId);

  log.warn("authz denied", {
    status,
    code,
    route: req.nextUrl?.pathname,
    requestId,
    ...meta,
  });

  const res = NextResponse.json(apiError(status, code, message, { requestId }), { status });
  return { ok: false, res };
}

/** Parse cron secret from headers (Stage 2 canonical + backwards-compat). */
function readCronProvidedSecret(req: NextRequest): string {
  const header =
    String(req.headers.get("x-cron-secret") ?? "").trim() ||
    String(req.headers.get("x-job-secret") ?? "").trim();

  if (header) return header;

  const authz = String(req.headers.get("authorization") ?? "").trim();
  if (authz.toLowerCase().startsWith("bearer ")) return authz.slice(7).trim();

  return "";
}

/** Stage 2 canonical is CRON_SECRET. Keep JOB_SECRET fallback temporarily. */
function readCronExpectedSecret(): string {
  return String(process.env.CRON_SECRET ?? process.env.JOB_SECRET ?? "").trim();
}

/**
 * Canonical guard runner:
 * - public: always ok
 * - auth: signed-in required
 * - admin: signed-in + admin required
 * - cron: header/bearer secret required
 */
export async function enforcePolicy(req: NextRequest, policy: RoutePolicy): Promise<GuardResult> {
  if (policy.kind === "public") {
    return { ok: true, principal: { kind: "anonymous" } };
  }

  if (policy.kind === "cron") {
    const expected = readCronExpectedSecret();
    const provided = readCronProvidedSecret(req);

    if (!expected) {
      return deny(req, 403, "CRON_MISCONFIGURED", "Forbidden", { policy: "cron", reason: "missing_secret" });
    }

    if (!provided || !safeEqual(provided, expected)) {
      return deny(req, 401, "CRON_UNAUTHORIZED", "Unauthorized", { policy: "cron" });
    }

    return { ok: true, principal: { kind: "cron" } };
  }

  // auth/admin both need a user
  const principal = await getClerkPrincipal();
  if (!principal || principal.kind !== "user") {
    return deny(req, 401, "UNAUTHORIZED", "Unauthorized", { policy: policy.kind });
  }

  if (policy.kind === "auth") {
    return { ok: true, principal };
  }

  // admin
  const ok = await isAdminForCurrentRequest(principal.userId);
  if (!ok) {
    return deny(req, 403, "FORBIDDEN", "Forbidden", {
      policy: "admin",
      userId: principal.userId,
      email: principal.email ?? null,
    });
  }

  return { ok: true, principal: { ...principal, kind: "admin" } };
}

/**
 * Convenience: enforce and early-return a Response on deny.
 * Usage:
 *   const guard = await guardOrReturn(req, { kind: "admin" });
 *   if ("res" in guard) return guard.res;
 */
export async function guardOrReturn(
  req: NextRequest,
  policy: RoutePolicy,
): Promise<{ principal: Principal } | { res: Response }> {
  const g = await enforcePolicy(req, policy);
  if (!g.ok) return { res: g.res };
  return { principal: g.principal };
}
