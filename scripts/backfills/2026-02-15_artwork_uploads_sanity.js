#!/usr/bin/env node
/**
 * 2026-02-15_artwork_uploads_sanity.js
 *
 * Idempotent backfill / sanity pass for artwork_uploads (canonical staged-artwork table).
 *
 * Safe behaviors:
 * - Only normalizes clearly safe fields:
 *   - trims file_name/file_url whitespace (only if changed)
 *   - lowercases file_type when present (optional, conservative)
 *
 * Usage:
 *   node -r dotenv/config scripts/backfills/2026-02-15_artwork_uploads_sanity.js
 *   node -r dotenv/config scripts/backfills/2026-02-15_artwork_uploads_sanity.js --dry-run
 */

const { Pool } = require("pg");

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  console.log(`[backfill] start ${nowIso()} dryRun=${dryRun}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existsRes = await client.query(`select to_regclass('public.artwork_uploads') as reg`);
    const reg = existsRes.rows?.[0]?.reg;

    if (!reg) {
      console.log("[backfill] artwork_uploads table not found; nothing to do.");
      await client.query("ROLLBACK");
      return;
    }

    // Scan counts (no mutation)
    const scanRes = await client.query(`
      select
        count(*)::int as total,
        sum(case when user_id is null then 1 else 0 end)::int as user_id_null,
        sum(case when order_id is null then 1 else 0 end)::int as order_id_null,
        sum(case when file_type is null then 1 else 0 end)::int as file_type_null,
        sum(case when btrim(file_name) <> file_name then 1 else 0 end)::int as file_name_needs_trim,
        sum(case when btrim(file_url) <> file_url then 1 else 0 end)::int as file_url_needs_trim
      from artwork_uploads
    `);

    const stats = scanRes.rows[0];
    console.log("[backfill] scan", stats);

    let updated = 0;

    // Trim file_name
    if (stats.file_name_needs_trim > 0) {
      if (!dryRun) {
        const r = await client.query(`
          update artwork_uploads
          set file_name = btrim(file_name)
          where btrim(file_name) <> file_name
        `);
        updated += r.rowCount || 0;
      }
      console.log(`[backfill] trim file_name: ${stats.file_name_needs_trim} ${dryRun ? "(dry-run)" : ""}`);
    }

    // Trim file_url
    if (stats.file_url_needs_trim > 0) {
      if (!dryRun) {
        const r = await client.query(`
          update artwork_uploads
          set file_url = btrim(file_url)
          where btrim(file_url) <> file_url
        `);
        updated += r.rowCount || 0;
      }
      console.log(`[backfill] trim file_url: ${stats.file_url_needs_trim} ${dryRun ? "(dry-run)" : ""}`);
    }

    // Normalize file_type to lowercase when present
    // (safe normalization; does not invent values)
    if (!dryRun) {
      const r = await client.query(`
        update artwork_uploads
        set file_type = lower(file_type)
        where file_type is not null and file_type <> lower(file_type)
      `);
      if ((r.rowCount || 0) > 0) {
        updated += r.rowCount || 0;
        console.log(`[backfill] lower(file_type): ${r.rowCount}`);
      }
    } else {
      const would = await client.query(`
        select count(*)::int as c
        from artwork_uploads
        where file_type is not null and file_type <> lower(file_type)
      `);
      console.log(`[backfill] lower(file_type): ${would.rows[0].c} (dry-run)`);
    }

    if (dryRun) {
      console.log(`[backfill] dry-run complete. Would update rows (aggregate): ${updated}`);
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log(`[backfill] committed. rowsUpdated(aggregate): ${updated}`);
    }

    console.log(`[backfill] end ${nowIso()}`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("[backfill] error", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
