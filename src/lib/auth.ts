import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { ApiError, getRequestIdFromHeaders } from "@/lib/apiError";

export type AuthzPolicy = "public" | "auth" | "admin" | "cron";

export type AuthContext = {
  policy: AuthzPolicy;
  requestId?: string;

  userId?: string | null;
  email?: string | null;

  isAuthed: boolean;
  isAdmin: boolean;
  isCron: boolean;
};

function parseAdminEmails(): Set<string> {
  const raw = (process.env.ADMIN_EMAILS || "").trim();
  if (!raw) return new Set();

  // Supports:
  // - comma separated: "a@x.com,b@y.com"
  // - whitespace separated
  // - newline separated
  const parts = raw
    .split(/[\s,]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return new Set(parts);
}

const ADMIN_EMAILS = parseAdminEmails();

function readCronSecretFromEnv(): string {
  const v = (process.env.CRON_SECRET || "").trim();
  return v;
}

function isCronAuthorized(req: Request): boolean {
  const cronSecret = readCronSecretFromEnv();
  if (!cronSecret) return false;

  const h = req.headers;

  // accept either:
  // - x-cron-secret: <secret>
  // - authorization: Bearer <secret>
  const direct = (h.get("x-cron-secret") || "").trim();
  if (direct && direct === cronSecret) return true;

  const authz = (h.get("authorization") || "").trim();
  const m = /^bearer\s+(.+)$/i.exec(authz);
  if (m && m[1] && m[1].trim() === cronSecret) return true;

  return false;
}

async function resolveEmail(): Promise<string | null> {
  try {
    const u = await currentUser();
    const e = u?.emailAddresses?.[0]?.emailAddress ?? null;
    return e ? e.toLowerCase() : null;
  } catch {
    // If Clerk isn't available / auth() only
    return null;
  }
}

export async function getAuthContext(req: Request, policy: AuthzPolicy): Promise<AuthContext> {
  const requestId = getRequestIdFromHeaders(req.headers);

  const cronOk = isCronAuthorized(req);
  const { userId } = auth();

  const email = userId ? await resolveEmail() : null;
  const authed = Boolean(userId);
  const admin = Boolean(email && ADMIN_EMAILS.size > 0 && ADMIN_EMAILS.has(email));

  const ctx: AuthContext = {
    policy,
    requestId,
    userId: userId ?? null,
    email,
    isAuthed: authed,
    isAdmin: admin,
    isCron: cronOk,
  };

  return ctx;
}

export async function enforcePolicy(req: Request, policy: AuthzPolicy): Promise<AuthContext> {
  const ctx = await getAuthContext(req, policy);

  if (policy === "public") return ctx;

  if (policy === "cron") {
    if (!ctx.isCron) {
      throw new ApiError({
        status: 401,
        code: "CRON_UNAUTHORIZED",
        message: "Cron secret missing or invalid",
        requestId: ctx.requestId,
      });
    }
    return ctx;
  }

  if (policy === "auth") {
    if (!ctx.isAuthed) {
      throw new ApiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Authentication required",
        requestId: ctx.requestId,
      });
    }
    return ctx;
  }

  // admin
  if (!ctx.isAuthed) {
    throw new ApiError({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Authentication required",
      requestId: ctx.requestId,
    });
  }

  if (!ctx.isAdmin) {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "Admin access required",
      requestId: ctx.requestId,
    });
  }

  return ctx;
}

export function logAuthzDenial(opts: {
  req: Request;
  policy: AuthzPolicy;
  requestId?: string;
  reason: string;
  meta?: Record<string, unknown>;
}) {
  // Keep it simple and structured; integrate into your logger later.
  const payload = {
    timestamp: new Date().toISOString(),
    level: "warn",
    message: "authz_denied",
    policy: opts.policy,
    requestId: opts.requestId,
    reason: opts.reason,
    path: new URL(opts.req.url).pathname,
    method: (opts.req as any).method || undefined,
    ...opts.meta,
  };

  console.warn(JSON.stringify(payload));
}
