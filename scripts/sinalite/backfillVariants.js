#!/usr/bin/env node
/**
 * scripts/sinalite/backfillVariants.js
 *
 * Backfill and maintain a local cache of Sinalite variant prices using
 * the /variants/{productId}/{offset} endpoint.
 *
 * Node.js: v22 compatible, plain JavaScript.
 *
 * DB:
 *   - Uses node-postgres (pg) Pool
 *   - Reads connection string from env: DATABASE_URL
 *
 * Sinalite config (env):
 *   - SINALITE_BASE_URL (default: https://liveapi.sinalite.com)
 *   - SINALITE_CLIENT_ID
 *   - SINALITE_CLIENT_SECRET
 *   - SINALITE_AUTH_URL (optional, defaults to `${SINALITE_BASE_URL}/auth/token`)
 *   - SINALITE_AUDIENCE (optional, default: https://apiconnect.sinalite.com)
 *
 * Tables created automatically if missing:
 *
 *   create table if not exists sinalite_product_variants (
 *     product_id integer not null,
 *     store_code text not null,
 *     key text not null,
 *     price numeric not null,
 *     raw_json jsonb null,
 *     created_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now(),
 *     primary key (product_id, store_code, key)
 *   );
 *
 *   create index if not exists idx_sinalite_product_variants_lookup
 *     on sinalite_product_variants (product_id, store_code, key);
 *
 *   create index if not exists idx_sinalite_product_variants_updated
 *     on sinalite_product_variants (updated_at);
 *
 *   create table if not exists sinalite_variant_option_map (
 *     product_id integer not null,
 *     store_code text not null,
 *     key text not null,
 *     option_ids integer[] not null,
 *     created_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now(),
 *     primary key (product_id, store_code, key)
 *   );
 *
 *   create index if not exists idx_sinalite_variant_option_map_option_ids
 *     on sinalite_variant_option_map using gin (option_ids);
 *
 * Usage examples:
 *   node scripts/sinalite/backfillVariants.js --store=CA --concurrency=3
 *   node scripts/sinalite/backfillVariants.js --store=US --productId=1
 */

/* eslint-disable no-console */

const { Pool } = require("pg");

// Node 22 has global fetch; guard just in case.
if (typeof fetch !== "function") {
  // eslint-disable-next-line global-require
  global.fetch = require("node-fetch");
}

// ────────────────────────────────────────────────────────────
// Env helpers
// ────────────────────────────────────────────────────────────

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function getRequiredEnv(key) {
  const v = pickEnv(key);
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

function nowIso() {
  return new Date().toISOString();
}

function log(level, ...args) {
  console.log(`[${nowIso()}] [${level}]`, ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────
// CLI args
// ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    store: null,
    productId: null,
    limit: null,
    concurrency: 3,
    sinceHours: null,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--store=")) {
      args.store = arg.split("=", 2)[1];
    } else if (arg.startsWith("--productId=")) {
      const v = Number(arg.split("=", 2)[1]);
      if (Number.isFinite(v) && v > 0) args.productId = v;
    } else if (arg.startsWith("--limit=")) {
      const v = Number(arg.split("=", 2)[1]);
      if (Number.isFinite(v) && v > 0) args.limit = v;
    } else if (arg.startsWith("--concurrency=")) {
      const v = Number(arg.split("=", 2)[1]);
      if (Number.isFinite(v) && v > 0) args.concurrency = v;
    } else if (arg.startsWith("--sinceHours=")) {
      const v = Number(arg.split("=", 2)[1]);
      if (Number.isFinite(v) && v > 0) args.sinceHours = v;
    }
  }

  return args;
}

function resolveStoreCode(rawStore) {
  const val = (rawStore || "").trim().toUpperCase();
  if (val === "CA" || val === "EN_CA" || val === "CAD") {
    return { storeCode: "en_ca", storeLabel: "CA" };
  }
  // default US
  return { storeCode: "en_us", storeLabel: "US" };
}

// ────────────────────────────────────────────────────────────
// Auth (client credentials) with simple cache
// ────────────────────────────────────────────────────────────

const tokenCache = {
  bearer: null,
  expiresAtMs: 0,
};

async function fetchAccessToken() {
  const baseUrl =
    pickEnv("SINALITE_AUTH_URL") ||
    `${(pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com")
      .replace(/\/+$/, "")}/auth/token`;

  const clientId = getRequiredEnv("SINALITE_CLIENT_ID");
  const clientSecret = getRequiredEnv("SINALITE_CLIENT_SECRET");
  const audience =
    pickEnv("SINALITE_AUDIENCE") || "https://apiconnect.sinalite.com";

  const body = {
    client_id: clientId,
    client_secret: clientSecret,
    audience,
    grant_type: "client_credentials",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(
        `Sinalite auth failed: ${res.status} ${res.statusText}${
          text ? ` – ${text.slice(0, 200)}` : ""
        }`,
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `Sinalite auth returned non-JSON: ${text.slice(0, 200)}`,
      );
    }

    const token = (data && data.access_token) || "";
    let type = (data && data.token_type) || "Bearer";

    if (!token || typeof token !== "string") {
      throw new Error("Invalid Sinalite token response (missing access_token)");
    }

    type = String(type).trim() || "Bearer";
    const bearer = /^Bearer\\s/i.test(type) ? `${type} ${token}` : `Bearer ${token}`;

    const expiresInSec =
      typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
        ? data.expires_in
        : 3600;
    const ttlMs = Math.max(60_000, Math.min(24 * 3600 * 1000, expiresInSec * 1000));

    tokenCache.bearer = bearer;
    tokenCache.expiresAtMs = Date.now() + ttlMs;

    return bearer;
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessTokenCached() {
  const now = Date.now();
  if (tokenCache.bearer && now < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.bearer;
  }
  return fetchAccessToken();
}

// ────────────────────────────────────────────────────────────
// API fetch with retries/backoff
// ────────────────────────────────────────────────────────────

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 500;

async function apiGetJson(path) {
  const base =
    pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com";
  const baseNormalized = base.replace(/\/+$/, "");
  const url = `${baseNormalized}/${String(path).replace(/^\\/+/, "")}`;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    let bearer;

    try {
      bearer = await getAccessTokenCached();
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = BASE_DELAY_MS * attempt;
      log(
        "WARN",
        `Auth attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}. Retrying in ${delay}ms`,
      );
      await sleep(delay);
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      const text = await res.text().catch(() => "");
      clearTimeout(timeout);

      if (res.status === 401 && attempt < MAX_RETRIES) {
        // Token may have expired; drop cache and retry.
        tokenCache.bearer = null;
        tokenCache.expiresAtMs = 0;
        const delay = BASE_DELAY_MS * attempt;
        log(
          "WARN",
          `401 from ${url} on attempt ${attempt}/${MAX_RETRIES}; refreshing token and retrying in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(
            `Sinalite ${res.status} ${res.statusText} @ ${url} (max retries reached)`,
          );
        }
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterSec = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : NaN;
        const delay =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log(
          "WARN",
          `Sinalite ${res.status} from ${url}; attempt ${attempt}/${MAX_RETRIES}, retrying in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        throw new Error(
          `Sinalite ${res.status} ${res.statusText} @ ${url} – ${text.slice(
            0,
            200,
          )}`,
        );
      }

      if (!text) return null;

      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(
          `Non-JSON response from ${url}: ${text.slice(0, 200)}`,
        );
      }
    } catch (err) {
      clearTimeout(timeout);
      if (attempt >= MAX_RETRIES) {
        throw err;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log(
        "WARN",
        `Request to ${url} failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
}

// ────────────────────────────────────────────────────────────
// DB setup and helpers
// ────────────────────────────────────────────────────────────

async function ensureTables(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS sinalite_product_variants (
        product_id INTEGER NOT NULL,
        store_code TEXT NOT NULL,
        key TEXT NOT NULL,
        price NUMERIC NOT NULL,
        raw_json JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (product_id, store_code, key)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sinalite_product_variants_lookup
        ON sinalite_product_variants (product_id, store_code, key);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sinalite_product_variants_updated
        ON sinalite_product_variants (updated_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sinalite_variant_option_map (
        product_id INTEGER NOT NULL,
        store_code TEXT NOT NULL,
        key TEXT NOT NULL,
        option_ids INTEGER[] NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (product_id, store_code, key)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sinalite_variant_option_map_option_ids
        ON sinalite_variant_option_map USING GIN (option_ids);
    `);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function tableExists(pool, tableName) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1;
    `,
      [tableName],
    );
    return res.rowCount > 0;
  } finally {
    client.release();
  }
}

async function resolveSinaliteProductsIdColumn(pool) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sinalite_products'
        AND column_name IN ('product_id', 'id')
      ORDER BY CASE column_name WHEN 'product_id' THEN 1 ELSE 2 END
      LIMIT 1;
    `,
    );
    if (!res.rowCount) return null;
    return res.rows[0].column_name;
  } finally {
    client.release();
  }
}

async function loadProductIds(pool, options) {
  const { limit } = options;

  if (options.productId) {
    return [options.productId];
  }

  const hasTable = await tableExists(pool, "sinalite_products");
  if (!hasTable) {
    throw new Error(
      "Table sinalite_products does not exist. Provide --productId or create the table first.",
    );
  }

  const idColumn = await resolveSinaliteProductsIdColumn(pool);
  if (!idColumn) {
    throw new Error(
      "sinalite_products exists but has neither product_id nor id column.",
    );
  }

  const client = await pool.connect();
  try {
    const sql = [
      `SELECT DISTINCT ${idColumn} AS product_id FROM sinalite_products`,
      "WHERE",
      `${idColumn} IS NOT NULL`,
      "ORDER BY",
      `${idColumn} ASC`,
      limit ? "LIMIT $1" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const res = await client.query(sql, limit ? [limit] : []);
    return res.rows
      .map((r) => Number(r.product_id))
      .filter((n) => Number.isFinite(n) && n > 0);
  } finally {
    client.release();
  }
}

async function isProductFreshEnough(pool, productId, storeCode, sinceHours) {
  if (!sinceHours || !Number.isFinite(sinceHours) || sinceHours <= 0) {
    return false;
  }

  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT MAX(updated_at) AS last_updated
      FROM sinalite_product_variants
      WHERE product_id = $1 AND store_code = $2;
    `,
      [productId, storeCode],
    );

    if (!res.rowCount || !res.rows[0].last_updated) return false;

    const last = new Date(res.rows[0].last_updated);
    const cutoff = Date.now() - sinceHours * 3600 * 1000;
    return last.getTime() >= cutoff;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────────────────
// Variants fetching and upserts
// ────────────────────────────────────────────────────────────

async function fetchAllVariants(productId) {
  const variants = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const path = `variants/${productId}/${offset}`;
    const page = await apiGetJson(path);

    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    variants.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return variants;
}

function parseVariantItem(item) {
  if (!item || typeof item !== "object") return null;

  const key = String(item.key || "").trim();
  if (!key) return null;

  const rawPrice = item.price;
  const priceNum = Number(rawPrice);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return null;
  }

  const optionIds = key
    .split("-")
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    key,
    price: priceNum,
    optionIds,
    raw: item,
  };
}

async function upsertVariantsForProduct(pool, productId, storeCode, variants) {
  if (!variants.length) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Prepare rows
    const parsed = variants
      .map((v) => parseVariantItem(v))
      .filter(Boolean);

    if (!parsed.length) {
      await client.query("COMMIT");
      return;
    }

    // Upsert into sinalite_product_variants
    {
      const columns = [
        "product_id",
        "store_code",
        "key",
        "price",
        "raw_json",
        "updated_at",
      ];
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const row of parsed) {
        params.push(
          productId,
          storeCode,
          row.key,
          row.price,
          JSON.stringify(row.raw),
          new Date(),
        );
        const placeholders = columns.map(() => `$${paramIndex++}`);
        values.push(`(${placeholders.join(", ")})`);
      }

      const sql = `
        INSERT INTO sinalite_product_variants
          (${columns.join(", ")})
        VALUES
          ${values.join(", ")}
        ON CONFLICT (product_id, store_code, key) DO UPDATE SET
          price = EXCLUDED.price,
          raw_json = EXCLUDED.raw_json,
          updated_at = NOW();
      `;

      await client.query(sql, params);
    }

    // Upsert into sinalite_variant_option_map
    {
      const columns = [
        "product_id",
        "store_code",
        "key",
        "option_ids",
        "updated_at",
      ];
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const row of parsed) {
        params.push(
          productId,
          storeCode,
          row.key,
          row.optionIds,
          new Date(),
        );
        const placeholders = columns.map(() => `$${paramIndex++}`);
        values.push(`(${placeholders.join(", ")})`);
      }

      const sql = `
        INSERT INTO sinalite_variant_option_map
          (${columns.join(", ")})
        VALUES
          ${values.join(", ")}
        ON CONFLICT (product_id, store_code, key) DO UPDATE SET
          option_ids = EXCLUDED.option_ids,
          updated_at = NOW();
      `;

      await client.query(sql, params);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function processProduct(pool, productId, storeCode, sinceHours) {
  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) {
    log("WARN", `Skipping invalid productId: ${productId}`);
    return { productId, skipped: true, reason: "invalid_id" };
  }

  if (sinceHours && sinceHours > 0) {
    const fresh = await isProductFreshEnough(pool, pid, storeCode, sinceHours);
    if (fresh) {
      log(
        "INFO",
        `Product ${pid} / ${storeCode} is fresh (updated within last ${sinceHours}h), skipping`,
      );
      return { productId: pid, skipped: true, reason: "fresh" };
    }
  }

  log("INFO", `Fetching variants for product ${pid} / ${storeCode}`);

  let variants = [];
  try {
    variants = await fetchAllVariants(pid);
  } catch (err) {
    log(
      "ERROR",
      `Failed to fetch variants for product ${pid}: ${err.message}`,
    );
    return { productId: pid, skipped: true, reason: "fetch_error" };
  }

  if (!variants.length) {
    log("INFO", `No variants for product ${pid} / ${storeCode}`);
    return { productId: pid, skipped: true, reason: "no_variants" };
  }

  try {
    await upsertVariantsForProduct(pool, pid, storeCode, variants);
    log(
      "INFO",
      `Upserted ${variants.length} variants for product ${pid} / ${storeCode}`,
    );
    return { productId: pid, skipped: false, count: variants.length };
  } catch (err) {
    log(
      "ERROR",
      `DB upsert failed for product ${pid} / ${storeCode}: ${err.message}`,
    );
    return { productId: pid, skipped: true, reason: "db_error" };
  }
}

// ────────────────────────────────────────────────────────────
// Concurrency helper
// ────────────────────────────────────────────────────────────

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = [];
  const workerCount = Math.max(1, concurrency || 1);

  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const i = index;
          if (i >= items.length) break;
          index += 1;

          const item = items[i];
          try {
            // eslint-disable-next-line no-await-in-loop
            results[i] = await fn(item, i);
          } catch (err) {
            results[i] = { error: err };
          }
        }
      })(),
    );
  }

  await Promise.all(workers);
  return results;
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const { storeCode, storeLabel } = resolveStoreCode(args.store);
  const concurrency = Math.max(1, Math.min(10, args.concurrency || 3));

  const dbUrl = pickEnv("DATABASE_URL");
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL is not set. Provide DATABASE_URL in the environment.",
    );
  }

  const pool = new Pool({
    connectionString: dbUrl,
    max: Math.max(4, concurrency + 1),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  log("INFO", "Starting Sinalite variants backfill", {
    storeCode,
    storeLabel,
    concurrency,
    productId: args.productId || "all",
    limit: args.limit || "none",
    sinceHours: args.sinceHours || "none",
  });

  try {
    await ensureTables(pool);
    log("INFO", "Ensured sinalite variant tables exist");

    const productIds = await loadProductIds(pool, {
      productId: args.productId,
      limit: args.limit,
    });

    if (!productIds.length) {
      log("WARN", "No product ids found to process.");
      return;
    }

    log(
      "INFO",
      `Processing ${productIds.length} product(s) with concurrency=${concurrency}`,
    );

    const results = await runWithConcurrency(
      productIds,
      concurrency,
      (pid, idx) => processProduct(pool, pid, storeCode, args.sinceHours),
    );

    const summary = {
      total: productIds.length,
      processed: 0,
      skippedFresh: 0,
      skippedNoVariants: 0,
      skippedInvalid: 0,
      fetchErrors: 0,
      dbErrors: 0,
    };

    for (const r of results) {
      if (!r || typeof r !== "object") continue;

      if (r.skipped) {
        if (r.reason === "fresh") summary.skippedFresh += 1;
        else if (r.reason === "no_variants") summary.skippedNoVariants += 1;
        else if (r.reason === "invalid_id") summary.skippedInvalid += 1;
        else if (r.reason === "fetch_error") summary.fetchErrors += 1;
        else if (r.reason === "db_error") summary.dbErrors += 1;
      } else {
        summary.processed += 1;
      }
    }

    log("INFO", "Done backfilling Sinalite variants", summary);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    log("ERROR", "Fatal error in backfillVariants:", err.message);
    process.exit(1);
  });
}

