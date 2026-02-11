// src/lib/db.ts
import "server-only";

import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/lib/db/schema";

export type AppDb = NodePgDatabase<typeof schema> & { $client: Pool };

let _pool: Pool | null = null;
let _db: AppDb | null = null;

function envUrl(): string | null {
  const v =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.NEON_URL ??
    null;

  if (!v) return null;

  const s = String(v).trim();
  return s ? s : null;
}

function isBuildTime(): boolean {
  const phase = String(process.env.NEXT_PHASE ?? "");
  if (phase === "phase-production-build" || phase === "phase-export") return true;

  // Cloudflare Pages builds often run without DB access; treat as build-time too.
  if (process.env.CF_PAGES === "1") return true;

  return false;
}

function makeBuildStub(): AppDb {
  const fail = () => {
    throw new Error(
      "DB was accessed during build, but DATABASE_URL is not available in the build environment. " +
        "Move DB access inside request handlers or ensure DB env vars exist at build time."
    );
  };

  const fn = new Proxy(fail, {
    get() {
      return fn;
    },
    apply() {
      return fail();
    },
  });

  const stub = new Proxy(
    {},
    {
      get() {
        return fn;
      },
    }
  );

  return stub as unknown as AppDb;
}

function initDb(): AppDb {
  if (_db) return _db;

  const url = envUrl();
  if (!url) {
    if (isBuildTime()) return makeBuildStub();
    throw new Error(
      "DATABASE_URL is not set. Provide DATABASE_URL (or POSTGRES_URL/NEON_URL) in the environment."
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

// Preferred: call inside route handlers / server actions.
export function getDb(): AppDb {
  return initDb();
}

// Back-compat: allow existing `import { db } from "@/lib/db"` to keep working.
export const db: AppDb = new Proxy(
  {},
  {
    get(_t, prop) {
      const real = initDb() as any;
      return real[prop];
    },
  }
) as unknown as AppDb;

export function getPool(): Pool {
  return initDb().$client;
}
