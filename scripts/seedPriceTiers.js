#!/usr/bin/env node
/**
 * scripts/seedPriceTiers.js
 *
 * Seeds price_tiers for global markup tiers by quantity, per store (USD/CAD).
 *
 * Expected env vars (preferred):
 *  - MARKUP_TIERS_USD='[{"min":1,"max":49,"mult":1.35}, ...]'
 *  - MARKUP_TIERS_CAD='[{"min":1,"max":49,"mult":1.35}, ...]'
 *
 * Backward-compatible fallbacks:
 *  - MARKUP_TIERS_US -> USD
 *  - MARKUP_TIERS_CA -> CAD
 *
 * DB connection:
 *  - DATABASE_URL (preferred)
 *  - or NEON_URL / POSTGRES_URL / PGDATABASE style vars
 *
 * Usage:
 *  node scripts/seedPriceTiers.js
 *  node scripts/seedPriceTiers.js --dry-run
 */

const { Client } = require("pg");

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseJson(name, raw) {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) throw new Error(`${name} must be a JSON array`);
    return v;
  } catch (err) {
    throw new Error(`Failed to parse ${name}: ${err.message}`);
  }
}

function toInt(v, name) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n) {
    throw new Error(`${name} must be an integer (got ${JSON.stringify(v)})`);
  }
  return n;
}

function toNum(v, name) {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number (got ${JSON.stringify(v)})`);
  }
  return n;
}

function normalizeTiers(store, arr) {
  const tiers = arr.map((t, idx) => {
    const min = toInt(t.min, `${store}[${idx}].min`);
    const max = t.max === null ? null : toInt(t.max, `${store}[${idx}].max`);
    const mult = toNum(t.mult, `${store}[${idx}].mult`);

    if (min === null || min < 1) throw new Error(`${store}[${idx}].min must be >= 1`);
    if (max !== null && max < min) throw new Error(`${store}[${idx}].max must be >= min`);
    if (mult <= 0) throw new Error(`${store}[${idx}].mult must be > 0`);

    return { min, max, mult };
  });

  // Sort by min just to be safe
  tiers.sort((a, b) => a.min - b.min);

  // Validate non-overlapping and sensible structure
  for (let i = 0; i < tiers.length; i++) {
    const cur = tiers[i];
    const next = tiers[i + 1];

    if (i === 0 && cur.min !== 1) {
      throw new Error(`${store}: first tier min must be 1 (got ${cur.min})`);
    }

    if (next) {
      // No overlap: next.min must be > cur.max (if cur.max exists)
      if (cur.max === null) {
        throw new Error(`${store}: tier ${i} has max=null but is not the last tier`);
      }
      if (next.min <= cur.max) {
        throw new Error(
          `${store}: overlapping tiers (tier ${i} max=${cur.max} and tier ${i + 1} min=${next.min})`
        );
      }
      // Optional: contiguous expectation (common in qty tiers)
      if (next.min !== cur.max + 1) {
        // not fatal, but warn
        console.warn(
          `⚠️  ${store}: tiers are not contiguous (tier ${i} max=${cur.max}, next min=${next.min})`
        );
      }
    } else {
      // last tier can have max null or a number, both fine
    }
  }

  return tiers;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const dbUrl =
    pickEnv("DATABASE_URL", "NEON_URL", "POSTGRES_URL", "PGURL") ||
    null;

  if (!dbUrl) {
    console.error(
      "❌ Missing DATABASE_URL (or NEON_URL / POSTGRES_URL / PGURL). Set it and re-run."
    );
    process.exit(1);
  }

  // Prefer USD/CAD env vars, fallback to old US/CA names
  const rawUSD = pickEnv("MARKUP_TIERS_USD", "MARKUP_TIERS_US");
  const rawCAD = pickEnv("MARKUP_TIERS_CAD", "MARKUP_TIERS_CA");

  if (!rawUSD || !rawCAD) {
    console.error(
      "❌ Missing markup tier env vars.\n" +
        "Set MARKUP_TIERS_USD and MARKUP_TIERS_CAD (or legacy MARKUP_TIERS_US / MARKUP_TIERS_CA)."
    );
    process.exit(1);
  }

  const usdTiers = normalizeTiers("USD", parseJson("MARKUP_TIERS_USD/US", rawUSD));
  const cadTiers = normalizeTiers("CAD", parseJson("MARKUP_TIERS_CAD/CA", rawCAD));

  const rowsToInsert = [
    ...usdTiers.map((t) => ({
      scope: "global",
      scope_id: null,
      store: "USD",
      min_qty: t.min,
      max_qty: t.max,
      mult: t.mult,
      floor_pct: null,
    })),
    ...cadTiers.map((t) => ({
      scope: "global",
      scope_id: null,
      store: "CAD",
      min_qty: t.min,
      max_qty: t.max,
      mult: t.mult,
      floor_pct: null,
    })),
  ];

  console.log(`\nSeeding price_tiers (global) for USD/CAD`);
  console.log(`- USD tiers: ${usdTiers.length}`);
  console.log(`- CAD tiers: ${cadTiers.length}`);
  console.log(`- Total rows: ${rowsToInsert.length}`);
  console.log(dryRun ? "🧪 DRY RUN (no DB changes)\n" : "🚀 APPLYING changes\n");

  if (dryRun) {
    console.table(rowsToInsert);
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    // Delete existing global tiers for USD/CAD
    await client.query(
      `
      DELETE FROM price_tiers
      WHERE scope = 'global'
        AND scope_id IS NULL
        AND store IN ('USD','CAD')
      `
    );

    // Insert fresh rows
    const insertSql = `
      INSERT INTO price_tiers (scope, scope_id, store, min_qty, max_qty, mult, floor_pct)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    for (const r of rowsToInsert) {
      await client.query(insertSql, [
        r.scope,
        r.scope_id,
        r.store,
        r.min_qty,
        r.max_qty,
        r.mult,
        r.floor_pct,
      ]);
    }

    await client.query("COMMIT");

    console.log("✅ price_tiers seeded successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed, rolled back.\n", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("❌ Unhandled error:", e);
  process.exit(1);
});
