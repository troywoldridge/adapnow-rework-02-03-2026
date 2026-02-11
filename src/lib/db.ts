// src/lib/db.ts
import "server-only";

import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/lib/db/schema";

/**
 * App DB type
 * - drizzle adds the query builder methods
 * - $client provides the raw pg Pool for rare low-level use
 */
export type AppDb = NodePgDatabase<typeof schema> & { $client: Pool };

/* ---------------------------- internal singletons ---------------------------- */

let _pool: Pool | null = null;
let _db: AppDb | null = null;

/* --------------------------------- helpers --------------------------------- */

function readFirst(keys: string[]): string | null {
  for (const k of keys) {
    const v = (process.env as Record<string, string | undefined>)[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function envUrl(): string | null {
  return readFirst(["DATABASE_URL", "POSTGRES_URL", "NEON_URL"]);
}

function isBuildTime(): boolean {
  // Next sets NEXT_PHASE during builds. We never want to hard-crash module eval in build.
  const phase = String(process.env.NEXT_PHASE ?? "").toLowerCase();
  if (phase.includes("production-build") || phase.includes("export")) return true;

  // Cloudflare Pages/Workers builds may set these.
  // We only use them as hints to avoid import-time crashes during a build pipeline.
  const isCfPages = process.env.CF_PAGES === "1";
  const isCfWorkerBuild =
    process.env.CF_WORKER === "1" ||
    process.env.CLOUDFLARE_WORKERS === "1" ||
    process.env.WRANGLER_ENV !== undefined;

  if ((isCfPages || isCfWorkerBuild) && process.env.NODE_ENV !== "production") return true;

  return false;
}

function makeBuildStub(): AppDb {
  const fail = () => {
    throw new Error(
      "DB was accessed during build, but DATABASE_URL is not available in the build environment. " +
        "Move DB access inside request handlers (or server actions) or provide DATABASE_URL during the build."
    );
  };

  // A callable proxy that always throws only when invoked.
  const fn = new Proxy(fail, {
    get() {
      return fn;
    },
    apply() {
      return fail();
    },
  });

  // An object proxy that returns the callable proxy for any property.
  // This makes "db.select(...)" only throw when actually called, not at import-time.
  const obj = new Proxy(
    {},
    {
      get() {
        return fn;
      },
    }
  );

  return obj as unknown as AppDb;
}

function initDb(): AppDb {
  if (_db) return _db;

  const url = envUrl();

  if (!url) {
    // ✅ Critical: do NOT crash import-time during build.
    if (isBuildTime()) return makeBuildStub();

    // ✅ Runtime should fail loudly.
    throw new Error(
      "DATABASE_URL is not set. Provide DATABASE_URL (or POSTGRES_URL / NEON_URL) in the environment."
    );
  }

  if (!_pool) {
    _pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  const base = drizzle(_pool, { schema }) as unknown as AppDb;
  (base as any).$client = _pool;

  _db = base;
  return _db;
}

/* --------------------------------- exports --------------------------------- */

/**
 * Preferred: call inside handlers where you need it.
 * Helps keep build-time imports safe.
 */
export function getDb(): AppDb {
  return initDb();
}

/**
 * Back-compat: allow existing `import { db } from "@/lib/db"` to keep working.
 * Lazily resolves to the real db on first property access.
 */
export const db: AppDb = new Proxy(
  {},
  {
    get(_t, prop) {
      const real = initDb() as any;
      return real[prop];
    },
    // Very rare edge: if someone tries to call db like a function, fail clearly.
    apply() {
      throw new Error("db is not callable. Did you mean to call a db method like db.select(...) ?");
    },
  }
) as unknown as AppDb;

/**
 * Only export pool if you truly need raw pg access elsewhere.
 */
export function getPool(): Pool {
  const real = initDb();
  return real.$client;
}
