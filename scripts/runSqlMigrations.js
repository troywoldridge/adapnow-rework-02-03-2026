#!/usr/bin/env node
/**
 * scripts/runSqlMigrations.js
 *
 * A simple SQL migration runner that DOES NOT depend on Drizzle meta/journal.
 * It tracks applied files in a table and runs each migration once.
 *
 * Env:
 *   DATABASE_URL=postgres://...
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, "sql-migrations");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

function listSqlFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_sql_migrations (
      id bigserial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function alreadyApplied(client, filename) {
  const res = await client.query(
    `SELECT 1 FROM app_sql_migrations WHERE filename = $1 LIMIT 1`,
    [filename]
  );
  return res.rowCount > 0;
}

async function markApplied(client, filename) {
  await client.query(
    `INSERT INTO app_sql_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
    [filename]
  );
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log(`No migrations dir: ${MIGRATIONS_DIR}`);
      return;
    }

    const files = listSqlFiles(MIGRATIONS_DIR);
    if (!files.length) {
      console.log("No .sql migrations found.");
      return;
    }

    let ran = 0;

    for (const f of files) {
      const full = path.join(MIGRATIONS_DIR, f);
      const sql = fs.readFileSync(full, "utf8");

      const applied = await alreadyApplied(client, f);
      if (applied) {
        console.log(`✓ Skipping (already applied): ${f}`);
        continue;
      }

      console.log(`→ Applying: ${f}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await markApplied(client, f);
        await client.query("COMMIT");
        console.log(`✓ Applied: ${f}`);
        ran++;
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`✗ Failed: ${f}`);
        console.error(e?.message || e);
        process.exitCode = 1;
        return;
      }
    }

    if (ran === 0) console.log("Nothing new to migrate.");
    else console.log(`Done. Applied ${ran} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
