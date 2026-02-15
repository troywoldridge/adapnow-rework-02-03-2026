import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// IMPORTANT: this mock must be declared before importing the route module.
type QueryResult = { rows: any[] };

type PoolInstance = {
  query: (sql: string, params?: any[]) => Promise<QueryResult>;
  end: () => Promise<void>;
};

let currentPool: PoolInstance | null = null;

function makePoolMock(queryImpl: PoolInstance["query"]) {
  currentPool = {
    query: queryImpl,
    end: vi.fn(async () => {}),
  };
  return currentPool;
}

vi.mock("pg", () => {
  return {
    Pool: vi.fn(function PoolCtor(this: any) {
      // this gets replaced per-test by setting currentPool
      if (!currentPool) {
        // default behavior if test forgets to set it
        this.query = vi.fn(async () => ({ rows: [{ now: new Date().toISOString() }] }));
        this.end = vi.fn(async () => {});
        return;
      }
      this.query = currentPool.query;
      this.end = currentPool.end;
      return;
    }),
  };
});

function reqWithSecret(url = "http://localhost/api/admin/migrations/health", secret = "test-secret") {
  return new Request(url, {
    headers: {
      "x-migration-health-secret": secret,
    },
  });
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response was not JSON. status=${res.status} body=${text}`);
  }
}

describe("/api/admin/migrations/health route", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
    currentPool = null;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("401 without header", async () => {
    process.env.MIGRATION_HEALTH_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://example";

    // import after env set; module reads env only at request time, but keep consistent
    const mod = await import("./route");
    const res = await mod.GET(new Request("http://localhost/api/admin/migrations/health"));
    expect(res.status).toBe(401);

    const body = await readJson(res);
    expect(body).toEqual({ ok: false, error: "unauthorized" });
  });

  it("401 with wrong secret", async () => {
    process.env.MIGRATION_HEALTH_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://example";

    const mod = await import("./route");
    const res = await mod.GET(reqWithSecret("http://localhost/api/admin/migrations/health", "wrong-secret"));
    expect(res.status).toBe(401);

    const body = await readJson(res);
    expect(body).toEqual({ ok: false, error: "unauthorized" });
  });

  it("500 when DATABASE_URL missing (even with correct secret)", async () => {
    process.env.MIGRATION_HEALTH_SECRET = "test-secret";
    delete process.env.DATABASE_URL;

    const mod = await import("./route");
    const res = await mod.GET(reqWithSecret());
    expect(res.status).toBe(500);

    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Missing DATABASE_URL");
    expect(typeof body.at).toBe("string");
  });

  it("200 with correct secret; drizzle migrations table missing; latestMigration null", async () => {
    process.env.MIGRATION_HEALTH_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://example";

    // Mock queries based on SQL
    makePoolMock(async (sql) => {
      const s = String(sql);

      if (s.includes("select now() as now")) {
        return { rows: [{ now: "2026-02-15T00:00:00.000Z" }] };
      }

      if (s.includes("to_regclass('public.artwork_uploads'")) {
        return { rows: [{ reg: "artwork_uploads" }] };
      }

      if (s.includes("to_regclass('public.cart_artwork'")) {
        return { rows: [{ reg: "cart_artwork" }] };
      }

      if (s.includes("to_regclass('public.__drizzle_migrations'")) {
        return { rows: [{ reg: null }] };
      }

      // Should not be called when drizzle table is missing
      return { rows: [{}] };
    });

    const mod = await import("./route");
    const res = await mod.GET(reqWithSecret());
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.db?.connected).toBe(true);
    expect(body.db?.serverNow).toBe("2026-02-15T00:00:00.000Z");
    expect(body.expected).toEqual({
      artwork_uploads: true,
      cart_artwork: true,
      drizzle_migrations_table: false,
    });
    expect(body.latestMigration).toBeNull();
  });

  it("200 with correct secret; drizzle migrations table present; returns latestMigration", async () => {
    process.env.MIGRATION_HEALTH_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://example";

    makePoolMock(async (sql) => {
      const s = String(sql);

      if (s.includes("select now() as now")) {
        return { rows: [{ now: "2026-02-15T01:02:03.000Z" }] };
      }

      if (s.includes("to_regclass('public.artwork_uploads'")) {
        return { rows: [{ reg: "artwork_uploads" }] };
      }

      if (s.includes("to_regclass('public.cart_artwork'")) {
        return { rows: [{ reg: "cart_artwork" }] };
      }

      if (s.includes("to_regclass('public.__drizzle_migrations'")) {
        return { rows: [{ reg: "__drizzle_migrations" }] };
      }

      if (s.includes("from information_schema.columns") || s.includes("from __drizzle_migrations")) {
        // This corresponds to the "latest" query in the route.
        return {
          rows: [
            {
              id: "0002_some_migration",
              hash: "deadbeef",
              created_at: "2026-02-15T01:00:00.000Z",
            },
          ],
        };
      }

      return { rows: [{}] };
    });

    const mod = await import("./route");
    const res = await mod.GET(reqWithSecret());
    expect(res.status).toBe(200);

    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(body.expected.artwork_uploads).toBe(true);
    expect(body.expected.cart_artwork).toBe(true);
    expect(body.expected.drizzle_migrations_table).toBe(true);

    expect(body.latestMigration).toEqual({
      id: "0002_some_migration",
      hash: "deadbeef",
      createdAt: "2026-02-15T01:00:00.000Z",
    });
  });

  it("500 when DB query throws (health_check_failed)", async () => {
    process.env.MIGRATION_HEALTH_SECRET = "test-secret";
    process.env.DATABASE_URL = "postgres://example";

    makePoolMock(async () => {
      throw new Error("boom");
    });

    const mod = await import("./route");
    const res = await mod.GET(reqWithSecret());
    expect(res.status).toBe(500);

    const body = await readJson(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("health_check_failed");
    expect(typeof body.details).toBe("string");
  });
});
