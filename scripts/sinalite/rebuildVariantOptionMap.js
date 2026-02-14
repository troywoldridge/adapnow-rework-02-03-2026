#!/usr/bin/env node
/**
 * scripts/sinalite/rebuildVariantOptionMap.js
 *
 * Canonical priced-variant cache for Sinalite:
 *   GET /variants/{productId}/{offset}  -> [{ price, key }, ...] (1000/page)
 *
 * Writes to:
 *   public.sinalite_variant_option_map
 *     PRIMARY KEY (product_id, store_code, key)
 *     option_ids int[] parsed from key
 *     price numeric (from API)
 *
 * Notes:
 * - We DO NOT attempt to map Sinalite "hash" rows from /product/{id}/{storeCode}.
 *   Those hash/value rows are not directly joinable to /variants keys.
 * - Existing columns (hash, variant_key, match_status, matched_at) are left NULL.
 *
 * Usage:
 *   pnpm dotenv -e .env -- node scripts/sinalite/rebuildVariantOptionMap.js --store=US
 *   pnpm dotenv -e .env -- node scripts/sinalite/rebuildVariantOptionMap.js --store=CA --concurrency=2
 *   pnpm dotenv -e .env -- node scripts/sinalite/rebuildVariantOptionMap.js --productId=18 --store=US --concurrency=1
 *
 * Safety:
 *   --maxPages=20000 (default 20000)
 *   --stopOnRepeat=true (default true)  stops when the next page repeats signature (prevents infinite loops)
 *   --stopOnNoNewKeys=true (default true) stops when a page yields 0 new keys (after first page)
 */

"use strict";

/* eslint-disable no-console */

const { Pool } = require("pg");

// ────────────────────────────────────────────────────────────
// Small utils
// ────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function log(level, msg, data) {
  if (data !== undefined) console.log(`[${nowIso()}] [${level}] ${msg}`, data);
  else console.log(`[${nowIso()}] [${level}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function mustEnv(key) {
  const v = pickEnv(key);
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function toInt(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function stableSigForKeys(keys) {
  // Fast-ish signature: count + first + last + checksum
  if (!keys.length) return "empty";
  let checksum = 0;
  for (let i = 0; i < keys.length; i++) {
    const s = keys[i];
    // tiny rolling checksum
    for (let j = 0; j < s.length; j++) checksum = (checksum * 31 + s.charCodeAt(j)) >>> 0;
  }
  return `${keys.length}:${keys[0]}:${keys[keys.length - 1]}:${checksum.toString(16)}`;
}

// ────────────────────────────────────────────────────────────
// Args
// ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    store: null, // US/CA or null for both
    productId: null,
    limit: null,
    concurrency: 2,
    maxPages: 20000,
    stopOnRepeat: true,
    stopOnNoNewKeys: true,
  };

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
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
    } else if (key === "--maxPages") {
      const v = nextVal();
      if (vInline == null) i++;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.maxPages = n;
    } else if (key.startsWith("--maxPages=")) {
      const n = Number(vInline);
      if (Number.isFinite(n) && n > 0) out.maxPages = n;
    } else if (key === "--stopOnRepeat") {
      const v = nextVal();
      if (vInline == null) i++;
      out.stopOnRepeat = String(v).toLowerCase() !== "false";
    } else if (key.startsWith("--stopOnRepeat=")) {
      out.stopOnRepeat = String(vInline).toLowerCase() !== "false";
    } else if (key === "--stopOnNoNewKeys") {
      const v = nextVal();
      if (vInline == null) i++;
      out.stopOnNoNewKeys = String(v).toLowerCase() !== "false";
    } else if (key.startsWith("--stopOnNoNewKeys=")) {
      out.stopOnNoNewKeys = String(vInline).toLowerCase() !== "false";
    }
  }

  return out;
}

function resolveStoreTargets(rawStore) {
  const v = String(rawStore ?? "").trim().toUpperCase();
  if (!v) return ["en_ca", "en_us"];
  if (v === "CA" || v === "EN_CA" || v === "CAD" || v === "6") return ["en_ca"];
  if (v === "US" || v === "EN_US" || v === "USD" || v === "9") return ["en_us"];
  // fallback: treat unknown as both
  return ["en_ca", "en_us"];
}

// ────────────────────────────────────────────────────────────
// Auth + API
// ────────────────────────────────────────────────────────────

const tokenCache = { bearer: null, expiresAtMs: 0 };

async function fetchAccessToken() {
  const baseUrl =
    pickEnv("SINALITE_AUTH_URL") ||
    `${(pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com").replace(/\/+$/, "")}/auth/token`;

  const clientId = mustEnv("SINALITE_CLIENT_ID");
  const clientSecret = mustEnv("SINALITE_CLIENT_SECRET");
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
    if (!res.ok) throw new Error(`Sinalite auth failed: ${res.status} ${res.statusText}${text ? ` – ${text.slice(0, 200)}` : ""}`);

    const data = JSON.parse(text || "{}");
    const token = typeof data.access_token === "string" ? data.access_token.trim() : "";
    const tokenType = (typeof data.token_type === "string" ? data.token_type.trim() : "Bearer") || "Bearer";
    if (!token) throw new Error("Invalid Sinalite token response (missing access_token)");

    const bearer = `${tokenType} ${token}`.trim().replace(/\s+/g, " ");
    const expiresInSec = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
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

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 500;

async function apiGetJson(path) {
  const base = pickEnv("SINALITE_BASE_URL") || "https://liveapi.sinalite.com";
  const url = `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;

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
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: bearer, Accept: "application/json" },
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
      return JSON.parse(text);
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

function normalizeVariants(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.data)) return payload.data;
  return [];
}

function parseVariantRow(item) {
  if (!item || typeof item !== "object") return null;
  const key = String(item.key ?? "").trim();
  if (!key) return null;

  // Sinalite returns numeric price
  const price = Number(item.price);
  if (!Number.isFinite(price) || price < 0) return null;

  const optionIds = key
    .split("-")
    .map((x) => toInt(x, NaN))
    .filter((n) => Number.isFinite(n) && n > 0);

  return { key, price, optionIds, raw: item };
}

// ────────────────────────────────────────────────────────────
// DB helpers
// ────────────────────────────────────────────────────────────

async function ensureIndexes(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Ensure we can efficiently look up by product+store+key (already PK)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_svom_lookup
      ON sinalite_variant_option_map (product_id, store_code, key);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_svom_updated
      ON sinalite_variant_option_map (updated_at);
    `);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function loadProductIds(pool, { productId, limit }) {
  if (productId) return [productId];

  const client = await pool.connect();
  try {
    const sql = [
      "SELECT DISTINCT product_id FROM sinalite_products",
      "WHERE product_id IS NOT NULL",
      "ORDER BY product_id ASC",
      limit ? "LIMIT $1" : "",
    ].filter(Boolean).join(" ");

    const res = await client.query(sql, limit ? [limit] : []);
    return res.rows.map((r) => Number(r.product_id)).filter((n) => Number.isFinite(n) && n > 0);
  } finally {
    client.release();
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertMapRows(pool, productId, storeCode, parsedRows) {
  if (!parsedRows.length) return { affected: 0, newKeys: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find which keys are new (cheap set membership for the page)
    const keys = parsedRows.map((r) => r.key);
    let newKeys = 0;
    {
      const existing = await client.query(
        `
        SELECT key
        FROM sinalite_variant_option_map
        WHERE product_id = $1 AND store_code = $2 AND key = ANY($3::text[]);
      `,
        [productId, storeCode, keys]
      );
      const set = new Set(existing.rows.map((r) => r.key));
      for (const k of keys) if (!set.has(k)) newKeys += 1;
    }

    let affected = 0;
    for (const batch of chunk(parsedRows, 500)) {
      const cols = ["product_id", "store_code", "key", "option_ids", "price"];
      const values = [];
      const params = [];
      let p = 1;

      for (const r of batch) {
        params.push(productId, storeCode, r.key, r.optionIds, r.price);
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      }

      const sql = `
        INSERT INTO sinalite_variant_option_map (${cols.join(", ")})
        VALUES ${values.join(", ")}
        ON CONFLICT (product_id, store_code, key) DO UPDATE SET
          option_ids = EXCLUDED.option_ids,
          price = EXCLUDED.price,
          updated_at = NOW();
      `;

      await client.query(sql, params);
      affected += batch.length;
    }

    await client.query("COMMIT");
    return { affected, newKeys };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────────────────
// Worker
// ────────────────────────────────────────────────────────────

async function processProductStore(pool, productId, storeCode, safety) {
  const pageSize = 1000;
  let offset = 0;
  let pages = 0;

  let totalParsed = 0;
  let totalAffected = 0;
  let totalNewKeys = 0;

  let lastSig = null;
  const seenKeys = new Set(); // per product+store run (for no-new-keys stop)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    pages += 1;
    if (pages > safety.maxPages) {
      log("WARN", `Product ${productId} / ${storeCode}: hit maxPages; stopping`, { pages, offset });
      break;
    }

    const payload = await apiGetJson(`variants/${productId}/${offset}`);
    const page = normalizeVariants(payload);

    if (!Array.isArray(page) || page.length === 0) break;

    const parsed = page.map(parseVariantRow).filter(Boolean);
    const keys = parsed.map((r) => r.key);
    const sig = stableSigForKeys(keys);

    // Repeat signature guard (prevents infinite paging loops)
    if (safety.stopOnRepeat && lastSig && sig === lastSig) {
      log("WARN", `Product ${productId} / ${storeCode}: repeated page signature; stopping`, {
        pages,
        offset,
        pageLen: page.length,
        sig,
      });
      break;
    }
    lastSig = sig;

    // Upsert
    const res = await upsertMapRows(pool, productId, storeCode, parsed);

    // Track unique keys (for no-new-keys stop)
    let pageNewUnique = 0;
    for (const k of keys) {
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        pageNewUnique += 1;
      }
    }

    totalParsed += parsed.length;
    totalAffected += res.affected;
    totalNewKeys += res.newKeys;

    log("INFO", `Product ${productId} / ${storeCode}: page offset=${offset}`, {
      received: page.length,
      parsed: parsed.length,
      affected: res.affected,
      newKeysDb: res.newKeys,
      newKeysUnique: pageNewUnique,
      sig,
      pages,
    });

    // Stop if we are no longer discovering anything new.
    if (safety.stopOnNoNewKeys && pages > 1 && pageNewUnique === 0) {
      log("WARN", `Product ${productId} / ${storeCode}: no new unique keys on page; stopping`, {
        pages,
        offset,
        pageLen: page.length,
      });
      break;
    }

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  log("INFO", `Done product ${productId} / ${storeCode}`, {
    totalParsed,
    totalAffected,
    totalNewKeysDb: totalNewKeys,
    uniqueKeysSeen: seenKeys.size,
    pages,
    lastOffset: offset,
  });

  return { productId, storeCode, totalParsed, totalAffected, pages, uniqueKeys: seenKeys.size };
}

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
          try {
            // eslint-disable-next-line no-await-in-loop
            results[i] = await fn(items[i], i);
          } catch (e) {
            results[i] = { error: e?.message || String(e) };
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
  const dbUrl = mustEnv("DATABASE_URL");

  const storeTargets = resolveStoreTargets(args.store);
  const safety = {
    maxPages: Math.max(1, args.maxPages || 20000),
    stopOnRepeat: args.stopOnRepeat !== false,
    stopOnNoNewKeys: args.stopOnNoNewKeys !== false,
  };

  const pool = new Pool({
    connectionString: dbUrl,
    max: Math.max(4, (args.concurrency || 2) + 2),
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

  log("INFO", "Starting rebuildVariantOptionMap", {
    productId: args.productId || "all",
    limit: args.limit || "none",
    storeTargets,
    concurrency: args.concurrency,
    safety,
  });

  try {
    await ensureIndexes(pool);

    const productIds = await loadProductIds(pool, { productId: args.productId, limit: args.limit });
    if (!productIds.length) {
      log("WARN", "No product ids found in sinalite_products.");
      return;
    }

    // Expand work: productId x storeTargets
    const work = [];
    for (const pid of productIds) {
      for (const storeCode of storeTargets) {
        work.push({ pid, storeCode });
      }
    }

    log("INFO", `Processing ${work.length} product/store pairs`, { products: productIds.length });

    const results = await runWithConcurrency(work, Math.max(1, Math.min(10, args.concurrency || 2)), (item) =>
      processProductStore(pool, item.pid, item.storeCode, safety)
    );

    const summary = {
      pairs: work.length,
      ok: 0,
      errors: 0,
      totalParsed: 0,
      totalAffected: 0,
    };

    for (const r of results) {
      if (!r) continue;
      if (r.error) summary.errors += 1;
      else {
        summary.ok += 1;
        summary.totalParsed += r.totalParsed || 0;
        summary.totalAffected += r.totalAffected || 0;
      }
    }

    log("INFO", "Done rebuildVariantOptionMap", summary);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((e) => {
    log("ERROR", "Fatal error:", e?.message || String(e));
    process.exit(1);
  });
}
