#!/usr/bin/env node
/**
 * 2026-02-15_artwork_staged_canonicalize.js
 *
 * Idempotent backfill for artwork_staged canonicalization.
 *
 * What it does (generic + safe):
 * - Ensures updated_at is set (if null)
 * - Ensures meta is non-null JSON object (if null)
 * - Optionally normalizes status values (if null/empty)
 *
 * This script is intentionally conservative because Stage 3 is about consolidation
 * and compatibility, not domain redesign.
 *
 * Usage:
 *   node -r dotenv/config scripts/backfills/2026-02-15_artwork_staged_canonicalize.js
 *   node -r dotenv/config scripts/backfills/2026-02-15_artwork_staged_canonicalize.js --dry-run
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

    // Check table exists (fail fast, but safe)
    const existsRes = await client.query(
      `
      select to_regclass('public.artwork_staged') as reg
      `
    );
    const reg = existsRes.rows?.[0]?.reg;
    if (!reg) {
      console.log("[backfill] artwork_staged table not found; nothing to do.");
      await client.query("ROLLBACK");
      return;
    }

    // Scan candidates
    const scanRes = await client.query(
      `
      select
        count(*)::int as total,
        sum(case when updated_at is null then 1 else 0 end)::int as updated_at_null,
        sum(case when meta is null then 1 else 0 end)::int as meta_null,
        sum(case when status is null or btrim(status) = '' then 1 else 0 end)::int as status_blank
      from artwork_staged
      `
    );

    const stats = scanRes.rows[0];
    console.log("[backfill] scan", stats);

    let updated = 0;

    // Fix updated_at null
    if (stats.updated_at_null > 0) {
      if (!dryRun) {
        const r = await client.query(
          `
          update artwork_staged
          set updated_at = now()
          where updated_at is null
          `
        );
        updated += r.rowCount || 0;
      }
      console.log(`[backfill] updated_at null -> now(): ${stats.updated_at_null} ${dryRun ? "(dry-run)" : ""}`);
    }

    // Fix meta null -> {}
    if (stats.meta_null > 0) {
      if (!dryRun) {
        const r = await client.query(
          `
          update artwork_staged
          set meta = '{}'::jsonb
          where meta is null
          `
        );
        updated += r.rowCount || 0;
      }
      console.log(`[backfill] meta null -> {}: ${stats.meta_null} ${dryRun ? "(dry-run)" : ""}`);
    }

    // Fix blank status -> staged
    if (stats.status_blank > 0) {
      if (!dryRun) {
        const r = await client.query(
          `
          update artwork_staged
          set status = 'staged'
          where status is null or btrim(status) = ''
          `
        );
        updated += r.rowCount || 0;
      }
      console.log(`[backfill] status blank -> staged: ${stats.status_blank} ${dryRun ? "(dry-run)" : ""}`);
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
