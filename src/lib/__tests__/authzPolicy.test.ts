import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

type ClerkUser = {
  id: string;
  emailAddresses?: { emailAddress: string }[];
  publicMetadata?: Record<string, unknown>;
};

const clerk = {
  auth: vi.fn(),
  currentUser: vi.fn(),
};

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "undefined") delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
}

function makeReq(path = "/api/test", headers?: Record<string, string>) {
  return new NextRequest(`https://example.com${path}`, {
    headers: new Headers(headers || {}),
  });
}

async function importPolicyFresh() {
  // authzPolicy caches ADMIN_EMAILS allowset in module scope. Reset module for each test.
  vi.resetModules();

  // Re-apply mocks AFTER resetModules, otherwise they can disappear in fresh module graph.
  vi.doMock("@clerk/nextjs/server", () => ({
    auth: () => clerk.auth(),
    currentUser: () => clerk.currentUser(),
  }));

  vi.doMock("@/lib/requestId", () => ({
    getRequestId: () => "req_test_123",
  }));

  vi.doMock("@/lib/logger", () => ({
    withRequestId: () => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  }));

  vi.doMock("@/lib/apiError", () => ({
    apiError: (status: number, code: string, message: string, meta?: any) => ({
      ok: false,
      status,
      code,
      message,
      ...(meta || {}),
    }),
  }));

  return await import("@/lib/authzPolicy");
}

beforeEach(() => {
  vi.clearAllMocks();

  setEnv({
    CRON_SECRET: undefined,
    JOB_SECRET: undefined,
    ADMIN_EMAILS: undefined,
    ALLOW_ALL_ADMINS: undefined,
  });

  clerk.auth.mockResolvedValue({ userId: null, sessionId: null });
  clerk.currentUser.mockResolvedValue(null);
});

afterEach(() => {
  setEnv({
    CRON_SECRET: undefined,
    JOB_SECRET: undefined,
    ADMIN_EMAILS: undefined,
    ALLOW_ALL_ADMINS: undefined,
  });
});

describe("authzPolicy.enforcePolicy (Stage 2)", () => {
  it("public: always ok, anonymous principal", async () => {
    const { enforcePolicy } = await importPolicyFresh();
    const req = makeReq("/api/public");

    const g = await enforcePolicy(req, { kind: "public" });
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.principal.kind).toBe("anonymous");
  });

  describe("cron policy", () => {
    it("denies when CRON_SECRET/JOB_SECRET missing (403 CRON_MISCONFIGURED)", async () => {
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/cron/job", { "x-cron-secret": "anything" });

      const g = await enforcePolicy(req, { kind: "cron" });
      expect(g.ok).toBe(false);
      if (!g.ok) {
        expect(g.res.status).toBe(403);
        const body = await (g.res as any).json();
        expect(body.code).toBe("CRON_MISCONFIGURED");
      }
    });

    it("denies wrong secret (401 CRON_UNAUTHORIZED)", async () => {
      setEnv({ CRON_SECRET: "expected_secret" });
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/cron/job", { "x-cron-secret": "wrong" });

      const g = await enforcePolicy(req, { kind: "cron" });
      expect(g.ok).toBe(false);
      if (!g.ok) {
        expect(g.res.status).toBe(401);
        const body = await (g.res as any).json();
        expect(body.code).toBe("CRON_UNAUTHORIZED");
      }
    });

    it("accepts x-cron-secret when matches", async () => {
      setEnv({ CRON_SECRET: "expected_secret" });
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/cron/job", { "x-cron-secret": "expected_secret" });

      const g = await enforcePolicy(req, { kind: "cron" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("cron");
    });

    it("accepts x-job-secret (back-compat) when matches", async () => {
      setEnv({ CRON_SECRET: "expected_secret" });
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/cron/job", { "x-job-secret": "expected_secret" });

      const g = await enforcePolicy(req, { kind: "cron" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("cron");
    });

    it("accepts Authorization Bearer secret", async () => {
      setEnv({ CRON_SECRET: "expected_secret" });
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/cron/job", { authorization: "Bearer expected_secret" });

      const g = await enforcePolicy(req, { kind: "cron" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("cron");
    });

    it("JOB_SECRET fallback works if CRON_SECRET unset", async () => {
      setEnv({ CRON_SECRET: undefined, JOB_SECRET: "job_secret" });
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/cron/job", { "x-cron-secret": "job_secret" });

      const g = await enforcePolicy(req, { kind: "cron" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("cron");
    });
  });

  describe("auth policy", () => {
    it("denies when signed out (401 UNAUTHORIZED)", async () => {
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/me");

      const g = await enforcePolicy(req, { kind: "auth" });
      expect(g.ok).toBe(false);
      if (!g.ok) {
        expect(g.res.status).toBe(401);
        const body = await (g.res as any).json();
        expect(body.code).toBe("UNAUTHORIZED");
      }
    });

    it("ok when signed in (principal user)", async () => {
      clerk.auth.mockResolvedValue({ userId: "user_123", sessionId: "sess_1" });
      clerk.currentUser.mockResolvedValue({
        id: "user_123",
        emailAddresses: [{ emailAddress: "troy@example.com" }],
      } satisfies ClerkUser);

      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/me");

      const g = await enforcePolicy(req, { kind: "auth" });
      expect(g.ok).toBe(true);
      if (g.ok && g.principal.kind === "user") {
        expect(g.principal.userId).toBe("user_123");
        expect(g.principal.sessionId).toBe("sess_1");
        expect(g.principal.email).toBe("troy@example.com");
      }
    });
  });

  describe("admin policy", () => {
    it("denies when signed out (401 UNAUTHORIZED)", async () => {
      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/admin");

      const g = await enforcePolicy(req, { kind: "admin" });
      expect(g.ok).toBe(false);
      if (!g.ok) {
        expect(g.res.status).toBe(401);
        const body = await (g.res as any).json();
        expect(body.code).toBe("UNAUTHORIZED");
      }
    });

    it("denies signed-in non-admin (403 FORBIDDEN)", async () => {
      clerk.auth.mockResolvedValue({ userId: "user_123", sessionId: "sess_1" });
      clerk.currentUser.mockResolvedValue({
        id: "user_123",
        emailAddresses: [{ emailAddress: "user@example.com" }],
        publicMetadata: {},
      } satisfies ClerkUser);

      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/admin");

      const g = await enforcePolicy(req, { kind: "admin" });
      expect(g.ok).toBe(false);
      if (!g.ok) {
        expect(g.res.status).toBe(403);
        const body = await (g.res as any).json();
        expect(body.code).toBe("FORBIDDEN");
      }
    });

    it("allow via ALLOW_ALL_ADMINS=true (escape hatch)", async () => {
      setEnv({ ALLOW_ALL_ADMINS: "true" });

      clerk.auth.mockResolvedValue({ userId: "user_123", sessionId: "sess_1" });
      clerk.currentUser.mockResolvedValue({
        id: "user_123",
        emailAddresses: [{ emailAddress: "user@example.com" }],
      } satisfies ClerkUser);

      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/admin");

      const g = await enforcePolicy(req, { kind: "admin" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("admin");
    });

    it("allow via publicMetadata.role=admin", async () => {
      clerk.auth.mockResolvedValue({ userId: "user_123", sessionId: "sess_1" });
      clerk.currentUser.mockResolvedValue({
        id: "user_123",
        emailAddresses: [{ emailAddress: "user@example.com" }],
        publicMetadata: { role: "admin" },
      } satisfies ClerkUser);

      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/admin");

      const g = await enforcePolicy(req, { kind: "admin" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("admin");
    });

    it("allow via ADMIN_EMAILS allowlist", async () => {
      setEnv({ ADMIN_EMAILS: "admin@example.com other@example.com" });

      clerk.auth.mockResolvedValue({ userId: "user_123", sessionId: "sess_1" });
      clerk.currentUser.mockResolvedValue({
        id: "user_123",
        emailAddresses: [{ emailAddress: "Admin@Example.com" }],
        publicMetadata: {},
      } satisfies ClerkUser);

      const { enforcePolicy } = await importPolicyFresh();
      const req = makeReq("/api/admin");

      const g = await enforcePolicy(req, { kind: "admin" });
      expect(g.ok).toBe(true);
      if (g.ok) expect(g.principal.kind).toBe("admin");
    });
  });

  describe("guardOrReturn helper", () => {
    it("returns res on deny", async () => {
      const { guardOrReturn } = await importPolicyFresh();
      const req = makeReq("/api/admin");

      const out = await guardOrReturn(req, { kind: "admin" });
      expect("res" in out).toBe(true);
      if ("res" in out) expect(out.res.status).toBe(401);
    });

    it("returns principal on ok", async () => {
      clerk.auth.mockResolvedValue({ userId: "user_123", sessionId: "sess_1" });
      clerk.currentUser.mockResolvedValue({
        id: "user_123",
        emailAddresses: [{ emailAddress: "user@example.com" }],
      } satisfies ClerkUser);

      const { guardOrReturn } = await importPolicyFresh();
      const req = makeReq("/api/me");

      const out = await guardOrReturn(req, { kind: "auth" });
      expect("principal" in out).toBe(true);
      if ("principal" in out) expect(out.principal.kind).toBe("user");
    });
  });
});
