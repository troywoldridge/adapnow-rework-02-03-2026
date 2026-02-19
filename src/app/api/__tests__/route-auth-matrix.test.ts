import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Route access matrix (auth) - behavior-probing and safe imports
 *
 * This test:
 * - Recursively finds route.ts files under src/app/api
 * - Tries importing them (skips any that fail to import)
 * - Probes handlers to find representatives for:
 *   - public: not blocked when anonymous
 *   - me: blocked anon, allowed when authenticated
 *   - admin: blocked anon, allowed with admin secret headers
 *   - cron: blocked anon, allowed with cron/job secret headers
 */

/* ------------------------- Logger mock ------------------------- */
vi.mock("@/lib/logger", async () => {
  return { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, log: vi.fn() };
});

/* ------------------------- Clerk mock ------------------------- */
type AuthState =
  | { kind: "anon" }
  | { kind: "user"; userId: string }
  | { kind: "admin"; userId: string };

let authState: AuthState = { kind: "anon" };

vi.mock("@clerk/nextjs/server", async () => {
  return {
    auth: vi.fn(async () => {
      if (authState.kind === "anon") {
        return { userId: null, sessionId: null, orgId: null, getToken: vi.fn(async () => null) };
      }
      return { userId: authState.userId, sessionId: "sess_test", orgId: null, getToken: vi.fn(async () => "tok") };
    }),
    currentUser: vi.fn(async () => {
      if (authState.kind === "anon") return null;
      return {
        id: authState.userId,
        publicMetadata: {
          isAdmin: authState.kind === "admin",
          role: authState.kind === "admin" ? "admin" : "user",
        },
      };
    }),
  };
});

function isAuthBlockedStatus(s: number) {
  return s === 401 || s === 403;
}

function makeReq(method: "GET" | "POST", url: string, headers?: Record<string, string>, body?: any) {
  return new Request(url, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
}

type Handler = (req: Request) => Promise<Response>;

type LoadedRoute = {
  file: string;
  GET?: Handler;
  POST?: Handler;
};

async function listRouteFiles(): Promise<string[]> {
  const root = path.join(process.cwd(), "src", "app", "api");

  async function walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (e.isFile() && e.name === "route.ts") out.push(p);
    }
    return out;
  }

  return walk(root).catch(() => []);
}

async function tryImportRoute(file: string): Promise<LoadedRoute | null> {
  try {
    const mod = await import(pathToFileURL(file).href);
    const GET = typeof mod.GET === "function" ? (mod.GET as Handler) : undefined;
    const POST = typeof mod.POST === "function" ? (mod.POST as Handler) : undefined;
    if (!GET && !POST) return null;
    return { file, GET, POST };
  } catch {
    // Skip routes that currently fail to import (missing schema modules, WIP routes, etc)
    return null;
  }
}

async function loadAllWorkingRoutes(): Promise<LoadedRoute[]> {
  const files = await listRouteFiles();
  const loaded: LoadedRoute[] = [];
  for (const f of files) {
    const r = await tryImportRoute(f);
    if (r) loaded.push(r);
  }
  return loaded;
}

async function probe(handler: Handler, method: "GET" | "POST", headers?: Record<string, string>) {
  const res = await handler(makeReq(method, "http://localhost/api/_probe", headers, method === "POST" ? {} : undefined));
  return res.status;
}

function chooseHandler(r: LoadedRoute): { handler: Handler; method: "GET" | "POST" } {
  if (r.GET) return { handler: r.GET, method: "GET" };
  return { handler: r.POST!, method: "POST" };
}

async function findPublicRoute(routes: LoadedRoute[]) {
  authState = { kind: "anon" };
  for (const r of routes) {
    const { handler, method } = chooseHandler(r);
    const s = await probe(handler, method);
    if (!isAuthBlockedStatus(s)) return r;
  }
  return null;
}

async function findMeRoute(routes: LoadedRoute[]) {
  for (const r of routes) {
    const { handler, method } = chooseHandler(r);

    authState = { kind: "anon" };
    const sAnon = await probe(handler, method);

    authState = { kind: "user", userId: "user_test_1" };
    const sUser = await probe(handler, method);

    if (isAuthBlockedStatus(sAnon) && !isAuthBlockedStatus(sUser)) return r;
  }
  return null;
}

async function findAdminRoute(routes: LoadedRoute[]) {
  const headersToTry: Array<Record<string, string>> = [
    { "x-admin-secret": "admin_secret_test" },
    { "x-admin-key": "admin_secret_test" },
    { "x-admin-token": "admin_secret_test" },
    { authorization: "Bearer admin_secret_test" },
    { "x-admin-secret": "admin_secret_test", authorization: "Bearer admin_secret_test" },
  ];

  for (const r of routes) {
    const { handler, method } = chooseHandler(r);

    authState = { kind: "anon" };
    const sAnon = await probe(handler, method);

    if (!isAuthBlockedStatus(sAnon)) continue;

    for (const hdrs of headersToTry) {
      const s = await probe(handler, method, hdrs);
      if (!isAuthBlockedStatus(s)) return r;
    }
  }
  return null;
}

async function findCronRoute(routes: LoadedRoute[]) {
  const headersToTry: Array<Record<string, string>> = [
    { "x-cron-secret": "cron_secret_test" },
    { "x-job-secret": "cron_secret_test" },
    { "x-cron-key": "cron_secret_test" },
    { "x-job-key": "cron_secret_test" },
    { authorization: "Bearer cron_secret_test" },
    { "x-cron-secret": "cron_secret_test", authorization: "Bearer cron_secret_test" },
  ];

  for (const r of routes) {
    const { handler, method } = chooseHandler(r);

    authState = { kind: "anon" };
    const sAnon = await probe(handler, method);

    if (!isAuthBlockedStatus(sAnon)) continue;

    for (const hdrs of headersToTry) {
      const s = await probe(handler, method, hdrs);
      if (!isAuthBlockedStatus(s)) return r;
    }
  }
  return null;
}

describe("Route access matrix (auth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.ADMIN_SECRET = "admin_secret_test";
    process.env.CRON_SECRET = "cron_secret_test";
    process.env.JOB_SECRET = "cron_secret_test";

    authState = { kind: "anon" };
  });

  it("public route is accessible without auth (not 401/403)", async () => {
    const routes = await loadAllWorkingRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const pub = await findPublicRoute(routes);
    expect(pub, "No public route found among importable routes (one should return not-401/403 anonymously).").toBeTruthy();

    const { handler, method } = chooseHandler(pub!);
    authState = { kind: "anon" };
    const s = await probe(handler, method);
    expect(isAuthBlockedStatus(s)).toBe(false);
  });

  it("me route requires signed-in user", async () => {
    const routes = await loadAllWorkingRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const me = await findMeRoute(routes);
    expect(me, "No 'me-like' route found: needs (anon=401/403) AND (authed!=401/403).").toBeTruthy();

    const { handler, method } = chooseHandler(me!);

    authState = { kind: "anon" };
    const sAnon = await probe(handler, method);
    expect(isAuthBlockedStatus(sAnon)).toBe(true);

    authState = { kind: "user", userId: "user_test_1" };
    const sUser = await probe(handler, method);
    expect(isAuthBlockedStatus(sUser)).toBe(false);
  });

  it("admin route requires admin secret (or admin auth)", async () => {
    const routes = await loadAllWorkingRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const admin = await findAdminRoute(routes);
    expect(admin, "No admin-like route found: needs anon=401/403 and accepts an admin secret header.").toBeTruthy();

    const { handler, method } = chooseHandler(admin!);

    authState = { kind: "anon" };
    const sAnon = await probe(handler, method);
    expect(isAuthBlockedStatus(sAnon)).toBe(true);

    const tryHeaders: Array<Record<string, string>> = [
      { "x-admin-secret": "admin_secret_test" },
      { "x-admin-key": "admin_secret_test" },
      { "x-admin-token": "admin_secret_test" },
      { authorization: "Bearer admin_secret_test" },
      { "x-admin-secret": "admin_secret_test", authorization: "Bearer admin_secret_test" },
    ];

    const unlocked = [];
    for (const hdr of tryHeaders) unlocked.push(await probe(handler, method, hdr));
    expect(unlocked.some((s) => !isAuthBlockedStatus(s))).toBe(true);
  });

  it("cron route requires cron/job secret", async () => {
    const routes = await loadAllWorkingRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const cron = await findCronRoute(routes);
    expect(cron, "No cron-like route found: needs anon=401/403 and accepts a cron/job secret header.").toBeTruthy();

    const { handler, method } = chooseHandler(cron!);

    authState = { kind: "anon" };
    const sAnon = await probe(handler, method);
    expect(isAuthBlockedStatus(sAnon)).toBe(true);

    const tryHeaders: Array<Record<string, string>> = [
      { "x-cron-secret": "cron_secret_test" },
      { "x-job-secret": "cron_secret_test" },
      { "x-cron-key": "cron_secret_test" },
      { "x-job-key": "cron_secret_test" },
      { authorization: "Bearer cron_secret_test" },
      { "x-cron-secret": "cron_secret_test", authorization: "Bearer cron_secret_test" },
    ];

    const unlocked = [];
    for (const hdr of tryHeaders) unlocked.push(await probe(handler, method, hdr));
    expect(unlocked.some((s) => !isAuthBlockedStatus(s))).toBe(true);
  });
});
