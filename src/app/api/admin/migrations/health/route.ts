import "server-only";

import { NextResponse } from "next/server";
import { Pool } from "pg";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function nowIso() {
  return new Date().toISOString();
}

async function querySingle(pool: Pool, text: string, params: any[] = []) {
  const r = await pool.query(text, params);
  return r.rows?.[0] ?? null;
}

/**
 * Admin migration health endpoint
 *
 * GET /api/admin/migrations/health
 * Requires:
 *   - header: x-migration-health-secret: <MIGRATION_HEALTH_SECRET>
 *
 * Env:
 *   - DATABASE_URL
 *   - MIGRATION_HEALTH_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.MIGRATION_HEALTH_SECRET;
  const got = req.headers.get("x-migration-health-secret") || "";

  if (!secret || got !== secret) return unauthorized();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing DATABASE_URL", at: nowIso() },
      { status: 500 }
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });

  const startedAt = Date.now();
  try {
    // basic connectivity
    const ping = await querySingle(pool, "select now() as now");
    const serverNow = ping?.now ?? null;

    // expected tables (canonical reality)
    const artworkUploads = await querySingle(
      pool,
      "select to_regclass('public.artwork_uploads') as reg"
    );

    const cartArtwork = await querySingle(
      pool,
      "select to_regclass('public.cart_artwork') as reg"
    );

    // drizzle migrations table (may not exist depending on history)
    const drizzleReg = await querySingle(
      pool,
      "select to_regclass('public.__drizzle_migrations') as reg"
    );

    let latestMigration: null | { id: string; hash?: string; createdAt?: string } = null;

    if (drizzleReg?.reg) {
      const latest = await querySingle(
        pool,
        `
        select
          (case when exists (
            select 1 from information_schema.columns
            where table_schema='public'
              and table_name='__drizzle_migrations'
              and column_name='id'
          ) then (select id::text from __drizzle_migrations order by id desc limit 1) else null end) as id,
          (case when exists (
            select 1 from information_schema.columns
            where table_schema='public'
              and table_name='__drizzle_migrations'
              and column_name='hash'
          ) then (select hash::text from __drizzle_migrations order by id desc limit 1) else null end) as hash,
          (case when exists (
            select 1 from information_schema.columns
            where table_schema='public'
              and table_name='__drizzle_migrations'
              and column_name in ('created_at','createdAt')
          ) then (
            select coalesce(created_at::text, "createdAt"::text)
            from __drizzle_migrations
            order by id desc
            limit 1
          ) else null end) as created_at
        `
      );

      if (latest?.id) {
        latestMigration = {
          id: String(latest.id),
          hash: latest.hash ? String(latest.hash) : undefined,
          createdAt: latest.created_at ? String(latest.created_at) : undefined,
        };
      }
    }

    const durationMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      at: nowIso(),
      db: {
        connected: true,
        serverNow,
        durationMs,
      },
      expected: {
        artwork_uploads: Boolean(artworkUploads?.reg),
        cart_artwork: Boolean(cartArtwork?.reg),
        drizzle_migrations_table: Boolean(drizzleReg?.reg),
      },
      latestMigration,
    });
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        ok: false,
        at: nowIso(),
        error: "health_check_failed",
        durationMs,
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  } finally {
    await pool.end().catch(() => {});
  }
}
