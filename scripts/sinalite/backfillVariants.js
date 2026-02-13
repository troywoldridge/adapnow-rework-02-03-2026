#!/usr/bin/env node
/**
 * scripts/sinalite/backfillVariants.js
 *
 * Backfill and maintain a local cache of Sinalite variant prices using:
 *   GET /variants/{productId}/{offset}
 *
 * Node.js: v22 compatible, plain JavaScript.
 *
 * DB (Postgres):
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
 *   sinalite_product_variants(product_id, store_code, key, price, raw_json, created_at, updated_at)
 *   sinalite_variant_option_map(product_id, store_code, key, option_ids, created_at, updated_at)
 *
 * Usage examples:
 *   node scripts/sinalite/backfillVariants.js --store=CA --concurrency=3
 *   node scripts/sinalite/backfillVariants.js --store=US --productId=1
 *   node scripts/sinalite/backfillVariants.js --store CA --sinceHours 168
 *
 * Safety improvements:
 *   - Detects repeating pages (same set of keys) and stops.
 *   - Detects "no progress" (no new keys observed across pages) and stops.
 *   - Adds maxPages safety fuse to prevent runaway loops.
 *   - Logs received/parsed/affected/newKeys so "upserted 1000" can't lie.
 */

/* eslint-disable no-console */

const { Pool } = require("pg");
const crypto = require("crypto");

// ────────────────────────────────────────────────────────────
// Small utilities
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
  if (!v) throw new Error(`Missing required env var: ${key}`);
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

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function sha1(text) {
  return crypto.createHash("sha1").update(String(text)).digest("hex");
}

// ────────────────────────────────────────────────────────────
// CLI args
// ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    store: null,
    productId: null,
    limit: null,
    concurrency: 3,
    sinceHours: null,

    // New safety knobs (optional)
    maxPages: null,          // default handled below
    stopOnRepeat: true,      // allow override
    stopOnNoNewKeys: true,   // allow override
  };

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    // support --k=v and --k v
    const [k, vInline] = a.startsWith("--") ? a.split("=", 2) : [null, null];
    const key = k || a;

    const nextVal = () => (vInline != null ? vInline : args[i + 1]);

    if (key === "--store") {
      const v = nextVal();
      if (vInline == null) i++;
      out.store = v;
    } else if (key.startsWith("--store=")) {
      out.store = vInline;
    } else if (key === "--productId") {
      const v = nextVal();
      if (vInline == null) i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.productId = n;
    } else if (key.startsWith("--productId=")) {
      const n = Number(vInline);
      if (Number.isFinite(n) && n > 0) out.productId = n;
    } else if (key === "--limit") {
      const v = nextVal();
      if (vInline == null) i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (key.startsWith("--limit=")) {
      const n = Number(vInline);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (key === "--concurrency") {
      const v = nextVal();
      if (vInline == null) i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.concurrency = n;
    } else if (key.startsWith("--concurrency=")) {
      const n = Number(vInline);
      if (Number.isFinite(n) && n > 0) out.concurrency = n;
    } else if (key === "--sinceHours") {
      const v = nextVal();
      if (vInline == null) i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.sinceHours = n;
    } else if (key.startsWith("--sinceHours=")) {
      const n = Number(vInline);
      if (Number.isFinite(n) && n > 0) out.sinceHours = n;
    } else if (key === "--maxPages") {
      const v = nextVal();
      if (vInline == null) i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.maxPages = Math.floor(n);
    } else if (key.startsWith("--maxPages=")) {
      const n = Number(vInline);
      if (Number.isFinite(n) && n > 0) out.maxPages = Math.floor(n);
    } else if (key === "--noStopOnRepeat") {
      out.stopOnRepeat = false;
    } else if (key === "--noStopOnNoNewKeys") {
      out.stopOnNoNewKeys = false;
    }
  }

  return out;
}

function resolveStoreCode(rawStore) {
  const val = String(rawStore ?? "").trim().toUpperCase();
  if (val === "CA" || val === "EN_CA" || val === "CAD") {
    return { storeCode: "en_ca", storeLabel: "CA" };
  }
  return { storeCode: "en_us", storeLabel: "US" };
}

// ────────────────────────────────────────────────────────────
// Auth (client credentials) + cache
// ────────────────────────────────────────────────────────────

const tokenCache = {
  bearer: null,
  expiresAtMs: 0,
};

async function fetchAccessToken() {
  const baseUrl =
    pickEnv("SINALITE_AUTH_URL") ||
    `${(pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com").replace(/\/+$/, "")}/auth/token`;

  const clientId = getRequiredEnv("SINALITE_CLIENT_ID");
  const clientSecret = getRequiredEnv("SINALITE_CLIENT_SECRET");
  const audience = pickEnv("SINALITE_AUDIENCE") || "https://apiconnect.sinalite.com";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience,
        grant_type: "client_credentials",
      }),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(
        `Sinalite auth failed: ${res.status} ${res.statusText}${text ? ` – ${text.slice(0, 200)}` : ""}`
      );
    }

    let data;
    try {
      data = JSON.parse(text || "{}");
    } catch {
      throw new Error(`Sinalite auth returned non-JSON: ${text.slice(0, 200)}`);
    }

    const token = typeof data.access_token === "string" ? data.access_token.trim() : "";
    const tokenTypeRaw = typeof data.token_type === "string" ? data.token_type.trim() : "Bearer";
    const tokenType = tokenTypeRaw || "Bearer";

    if (!token) throw new Error("Invalid Sinalite token response (missing access_token)");

    const bearer = `${tokenType} ${token}`.trim().replace(/\s+/g, " ");

    const expiresInSec =
      typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
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
  if (tokenCache.bearer && now < tokenCache.expiresAtMs - 60_000) return tokenCache.bearer;
  return fetchAccessToken();
}

// ────────────────────────────────────────────────────────────
// API fetch with retries/backoff
// ────────────────────────────────────────────────────────────

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 500;

async function apiGetJson(path) {
  const base = pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com";
  const baseNormalized = base.replace(/\/+$/, "");
  const url = `${baseNormalized}/${String(path).replace(/^\/+/, "")}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let bearer;
    try {
      bearer = await getAccessTokenCached();
    } catch (err) {
      const delay = BASE_DELAY_MS * attempt;
      if (attempt >= MAX_RETRIES) throw err;
      log("WARN", `Auth attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}. Retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: bearer,
          "content-type": "application/json",
        },
        signal: controller.signal,
      });

      const text = await res.text().catch(() => "");
      clearTimeout(timeout);

      if (res.status === 401 && attempt < MAX_RETRIES) {
        tokenCache.bearer = null;
        tokenCache.expiresAtMs = 0;
        const delay = BASE_DELAY_MS * attempt;
        log("WARN", `401 from ${url}; refreshing token and retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (res.status === 404) return null;

      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Sinalite ${res.status} ${res.statusText} @ ${url} (max retries reached)`);
        }
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
        const delay =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : BASE_DELAY_MS * Math.pow(2, attempt - 1);

        log("WARN", `Sinalite ${res.status} from ${url}; attempt ${attempt}/${MAX_RETRIES}, retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`Sinalite ${res.status} ${res.statusText} @ ${url} – ${text.slice(0, 200)}`);
      }

      if (!text) return null;

      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      clearTimeout(timeout);
      if (attempt >= MAX_RETRIES) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log("WARN", `Request to ${url} failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  return null;
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
      [tableName]
    );
    return res.rowCount > 0;
  } finally {
    client.release();
  }
}

async function resolveSinaliteProductsIdColumn(pool) {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sinalite_products'
        AND column_name IN ('product_id', 'id')
      ORDER BY CASE column_name WHEN 'product_id' THEN 1 ELSE 2 END
      LIMIT 1;
    `);
    return res.rowCount ? res.rows[0].column_name : null;
  } finally {
    client.release();
  }
}

async function loadProductIds(pool, options) {
  const { limit } = options;

  if (options.productId) return [options.productId];

  const hasTable = await tableExists(pool, "sinalite_products");
  if (!hasTable) {
    throw new Error("Table sinalite_products does not exist. Provide --productId or create the table first.");
  }

  const idColumn = await resolveSinaliteProductsIdColumn(pool);
  if (!idColumn) {
    throw new Error("sinalite_products exists but has neither product_id nor id column.");
  }

  const client = await pool.connect();
  try {
    const sqlText = [
      `SELECT DISTINCT ${idColumn} AS product_id FROM sinalite_products`,
      `WHERE ${idColumn} IS NOT NULL`,
      `ORDER BY ${idColumn} ASC`,
      limit ? "LIMIT $1" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const res = await client.query(sqlText, limit ? [limit] : []);
    return res.rows
      .map((r) => Number(r.product_id))
      .filter((n) => Number.isFinite(n) && n > 0);
  } finally {
    client.release();
  }
}

async function isProductFreshEnough(pool, productId, storeCode, sinceHours) {
  if (!sinceHours || !Number.isFinite(sinceHours) || sinceHours <= 0) return false;

  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT MAX(updated_at) AS last_updated
      FROM sinalite_product_variants
      WHERE product_id = $1 AND store_code = $2;
    `,
      [productId, storeCode]
    );

    if (!res.rowCount || !res.rows[0].last_updated) return false;

    const last = new Date(res.rows[0].last_updated).getTime();
    if (!Number.isFinite(last)) return false;

    const cutoff = Date.now() - sinceHours * 3600 * 1000;
    return last >= cutoff;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────────────────
// Variants fetching and upserts
// ────────────────────────────────────────────────────────────

function normalizeVariantsResponse(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.data)) return payload.data;
  return [];
}

function parseVariantItem(item) {
  if (!item || typeof item !== "object") return null;

  const key = String(item.key || "").trim();
  if (!key) return null;

  const priceNum = Number(item.price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) return null;

  const optionIds = key
    .split("-")
    .map((part) => toInt(part, NaN))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    key,
    price: priceNum,
    optionIds,
    raw: item,
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function pageSignatureFromKeys(keys) {
  // stable signature: sort and hash (fast enough for 1000 keys)
  const sorted = [...keys].sort();
  return sha1(sorted.join("|"));
}

async function upsertVariantsForProduct(pool, productId, storeCode, variantsPage) {
  if (!variantsPage.length) return { affected: 0, parsed: 0 };

  const parsed = variantsPage.map(parseVariantItem).filter(Boolean);
  if (!parsed.length) return { affected: 0, parsed: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const batches = chunk(parsed, 500);
    let totalAffected = 0;

    for (const batch of batches) {
      // Upsert into sinalite_product_variants
      {
        const columns = ["product_id", "store_code", "key", "price", "raw_json"];
        const values = [];
        const params = [];
        let p = 1;

        for (const row of batch) {
          params.push(productId, storeCode, row.key, row.price, JSON.stringify(row.raw));
          values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        }

        const sqlText = `
          INSERT INTO sinalite_product_variants (${columns.join(", ")})
          VALUES ${values.join(", ")}
          ON CONFLICT (product_id, store_code, key) DO UPDATE SET
            price = EXCLUDED.price,
            raw_json = EXCLUDED.raw_json,
            updated_at = NOW();
        `;

        const r = await client.query(sqlText, params);
        totalAffected += r.rowCount || 0;
      }

      // Upsert into sinalite_variant_option_map (only when optionIds parsed)
      {
        const mapRows = batch.filter((r) => Array.isArray(r.optionIds) && r.optionIds.length > 0);
        if (mapRows.length) {
          const columns = ["product_id", "store_code", "key", "option_ids"];
          const values = [];
          const params = [];
          let p = 1;

          for (const row of mapRows) {
            params.push(productId, storeCode, row.key, row.optionIds);
            values.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
          }

          const sqlText = `
            INSERT INTO sinalite_variant_option_map (${columns.join(", ")})
            VALUES ${values.join(", ")}
            ON CONFLICT (product_id, store_code, key) DO UPDATE SET
              option_ids = EXCLUDED.option_ids,
              updated_at = NOW();
          `;

          await client.query(sqlText, params);
        }
      }
    }

    await client.query("COMMIT");
    return { affected: totalAffected, parsed: parsed.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function processProduct(pool, productId, storeCode, sinceHours, safety) {
  const pid = Number(productId);
  if (!Number.isFinite(pid) || pid <= 0) {
    log("WARN", `Skipping invalid productId: ${productId}`);
    return { productId, skipped: true, reason: "invalid_id" };
  }

  if (sinceHours && sinceHours > 0) {
    const fresh = await isProductFreshEnough(pool, pid, storeCode, sinceHours);
    if (fresh) {
      log("INFO", `Product ${pid} / ${storeCode} is fresh (<= ${sinceHours}h), skipping`);
      return { productId: pid, skipped: true, reason: "fresh" };
    }
  }

  const pageSize = 1000;
  let offset = 0;
  let pages = 0;

  // Progress tracking
  let seenAny = false;
  let totalParsed = 0;
  let totalAffected = 0;

  // Used to detect infinite loops / repeats
  const seenKeys = new Set();
  let lastSig = null;
  let repeatCount = 0;
  let noNewKeysStreak = 0;

  log("INFO", `Fetching variants for product ${pid} / ${storeCode}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    pages += 1;

    if (safety.maxPages && pages > safety.maxPages) {
      log(
        "WARN",
        `Product ${pid} / ${storeCode}: reached maxPages=${safety.maxPages}; stopping to prevent runaway loop`,
        { offset, pages }
      );
      break;
    }

    const path = `variants/${pid}/${offset}`;
    let payload;
    try {
      payload = await apiGetJson(path);
    } catch (err) {
      log("ERROR", `Failed to fetch variants page (offset=${offset}) for product ${pid}: ${err.message}`);
      return { productId: pid, skipped: true, reason: "fetch_error" };
    }

    const page = normalizeVariantsResponse(payload);
    if (!Array.isArray(page) || page.length === 0) {
      if (!seenAny) log("INFO", `No variants for product ${pid} / ${storeCode}`);
      break;
    }

    seenAny = true;

    const keys = page
      .map((it) => (it && typeof it === "object" ? String(it.key || "").trim() : ""))
      .filter(Boolean);

    const sig = pageSignatureFromKeys(keys);

    if (safety.stopOnRepeat) {
      if (lastSig && sig === lastSig) {
        repeatCount += 1;
        log(
          "WARN",
          `Product ${pid} / ${storeCode}: page signature repeated (repeatCount=${repeatCount}). Likely paging loop; stopping.`,
          { offset, pageLen: page.length, sig: sig.slice(0, 8) }
        );
        break;
      }
    }

    let newKeysThisPage = 0;
    for (const k of keys) {
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        newKeysThisPage += 1;
      }
    }

    if (safety.stopOnNoNewKeys) {
      if (newKeysThisPage === 0) {
        noNewKeysStreak += 1;
        log(
          "WARN",
          `Product ${pid} / ${storeCode}: no new keys observed on this page (streak=${noNewKeysStreak}). Likely repeating data; stopping.`,
          { offset, pageLen: page.length, sig: sig.slice(0, 8) }
        );
        break;
      }
      noNewKeysStreak = 0;
    }

    try {
      const res = await upsertVariantsForProduct(pool, pid, storeCode, page);
      totalParsed += res.parsed;
      totalAffected += res.affected;

      log("INFO", `Product ${pid} / ${storeCode}: page offset=${offset}`, {
        received: page.length,
        parsed: res.parsed,
        affected: res.affected,
        newKeys: newKeysThisPage,
        sig: sig.slice(0, 8),
        pages,
      });
    } catch (err) {
      log("ERROR", `DB upsert failed for product ${pid} / ${storeCode} at offset=${offset}: ${err.message}`);
      return { productId: pid, skipped: true, reason: "db_error" };
    }

    lastSig = sig;

    if (page.length < pageSize) break;

    offset += pageSize;
  }

  if (!seenAny || totalParsed === 0) {
    return { productId: pid, skipped: true, reason: "no_variants" };
  }

  log("INFO", `Done product ${pid} / ${storeCode}`, {
    totalReceivedParsed: totalParsed,
    totalAffectedRows: totalAffected,
    uniqueKeysSeen: seenKeys.size,
    pages,
    lastOffset: offset,
  });

  return { productId: pid, skipped: false, count: totalParsed };
}


// ────────────────────────────────────────────────────────────
// Concurrency helper
// ────────────────────────────────────────────────────────────

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workerCount = Math.max(1, concurrency || 1);
  const workers = [];

  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const i = index;
          if (i >= items.length) break;
          index += 1;

          try {
            // eslint-disable-next-line no-await-in-loop
            results[i] = await fn(items[i], i);
          } catch (err) {
            results[i] = { skipped: true, reason: "worker_error", error: err?.message || String(err) };
          }
        }
      })()
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
  if (!dbUrl) throw new Error("DATABASE_URL is not set.");

  // Default safety: enough to cover normal products, prevents runaway loops.
  const safety = {
    maxPages: args.maxPages || 25_000, // big enough for legit large products, but not infinite
    stopOnRepeat: args.stopOnRepeat !== false,
    stopOnNoNewKeys: args.stopOnNoNewKeys !== false,
  };

  const pool = new Pool({
    connectionString: dbUrl,
    max: Math.max(4, concurrency + 1),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  const shutdown = async (sig) => {
    try {
      log("WARN", `Received ${sig}, shutting down...`);
      await pool.end();
    } catch {
      // ignore
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log("INFO", "Starting Sinalite variants backfill", {
    storeCode,
    storeLabel,
    concurrency,
    productId: args.productId || "all",
    limit: args.limit || "none",
    sinceHours: args.sinceHours || "none",
    safety,
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

    log("INFO", `Processing ${productIds.length} product(s) with concurrency=${concurrency}`);

    const results = await runWithConcurrency(productIds, concurrency, (pid) =>
      processProduct(pool, pid, storeCode, args.sinceHours, safety)
    );

    const summary = {
      total: productIds.length,
      processed: 0,
      skippedFresh: 0,
      skippedNoVariants: 0,
      skippedInvalid: 0,
      fetchErrors: 0,
      dbErrors: 0,
      otherSkips: 0,
    };

    for (const r of results) {
      if (!r || typeof r !== "object") continue;

      if (r.skipped) {
        if (r.reason === "fresh") summary.skippedFresh += 1;
        else if (r.reason === "no_variants") summary.skippedNoVariants += 1;
        else if (r.reason === "invalid_id") summary.skippedInvalid += 1;
        else if (r.reason === "fetch_error") summary.fetchErrors += 1;
        else if (r.reason === "db_error") summary.dbErrors += 1;
        else summary.otherSkips += 1;
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
    log("ERROR", "Fatal error in backfillVariants:", err?.message || String(err));
    process.exit(1);
  });
}
