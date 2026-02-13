#!/usr/bin/env node

const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config();

const DEFAULT_API_BASE = 'https://api.sinaliteuppy.com';
const DEFAULT_AUDIENCE = 'https://apiconnect.sinalite.com';
const DEFAULT_STORE_CODES = ['en_ca', 'en_us'];
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const BACKOFF_MS = 800;

function log(level, message, payload) {
  const ts = new Date().toISOString();
  if (payload !== undefined) {
    console.log(`[${ts}] [${level}] ${message}`, payload);
    return;
  }
  console.log(`[${ts}] [${level}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: null,
    productId: null,
    storeCodes: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--limit' && argv[i + 1]) {
      args.limit = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (token === '--productId' && argv[i + 1]) {
      args.productId = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (token === '--storeCodes' && argv[i + 1]) {
      args.storeCodes = argv[i + 1]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      i += 1;
    }
  }

  return args;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function getConfig(args) {
  const apiBase = (process.env.SINALITE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    clientId: requireEnv('SINALITE_CLIENT_ID'),
    clientSecret: requireEnv('SINALITE_CLIENT_SECRET'),
    apiBase,
    authUrl: process.env.SINALITE_AUTH_URL || `${apiBase}/auth/token`,
    audience: process.env.SINALITE_AUDIENCE || DEFAULT_AUDIENCE,
    storeCodes:
      args.storeCodes ||
      (process.env.SINALITE_STORE_CODES || DEFAULT_STORE_CODES.join(','))
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
  };
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') || '0', 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS * Math.pow(2, attempt - 1);
        log('WARN', `Transient ${response.status} from ${url}, retrying in ${waitMs}ms (${attempt}/${retries})`);
        await sleep(waitMs);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt >= retries) throw error;
      const waitMs = BACKOFF_MS * Math.pow(2, attempt - 1);
      log('WARN', `Request failed (${error.message}), retrying in ${waitMs}ms (${attempt}/${retries})`);
      await sleep(waitMs);
    }
  }

  throw new Error(`Exhausted retries for ${url}`);
}

async function getToken(config) {
  const response = await fetchWithRetry(config.authUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
      grant_type: 'client_credentials',
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${text.slice(0, 300)}`);
  }

  const parsed = JSON.parse(text);
  if (!parsed.access_token) {
    throw new Error('Auth response missing access_token');
  }

  return `Bearer ${parsed.access_token}`;
}

async function apiGet(config, token, path) {
  const url = `${config.apiBase}/${path.replace(/^\//, '')}`;
  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      authorization: token,
      accept: 'application/json',
    },
  });

  const text = await response.text();
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return text ? JSON.parse(text) : null;
}

function parseDetails(payload) {
  if (Array.isArray(payload)) {
    return {
      array1: Array.isArray(payload[0]) ? payload[0] : [],
      array2: Array.isArray(payload[1]) ? payload[1] : [],
      array3: Array.isArray(payload[2]) ? payload[2] : [],
    };
  }

  const arrays = Object.values(payload || {}).filter(Array.isArray);
  return {
    array1: arrays[0] || [],
    array2: arrays[1] || [],
    array3: arrays[2] || [],
  };
}

function detectType(array1) {
  const sample = Array.isArray(array1) ? array1.find((x) => x && typeof x === 'object') : null;
  if (!sample) return 'regular';
  return 'opt_val_id' in sample || 'option_val' in sample ? 'roll_label' : 'regular';
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sinalite_variant_snapshots (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      detail_type text NOT NULL,
      options_json jsonb NOT NULL,
      variants_json jsonb NOT NULL,
      metadata_json jsonb NOT NULL,
      raw_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, store_code)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS sinalite_variants (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      detail_type text NOT NULL,
      variant_key text NOT NULL,
      variant_value text,
      raw_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (product_id, store_code, variant_key)
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_sinalite_variants_product_store ON sinalite_variants (product_id, store_code);`);
}

async function upsertSnapshot(client, productId, storeCode, detailType, details, payload) {
  await client.query(
    `INSERT INTO sinalite_variant_snapshots
      (product_id, store_code, detail_type, options_json, variants_json, metadata_json, raw_json, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW())
     ON CONFLICT (product_id, store_code) DO UPDATE SET
      detail_type = EXCLUDED.detail_type,
      options_json = EXCLUDED.options_json,
      variants_json = EXCLUDED.variants_json,
      metadata_json = EXCLUDED.metadata_json,
      raw_json = EXCLUDED.raw_json,
      updated_at = NOW();`,
    [
      productId,
      storeCode,
      detailType,
      JSON.stringify(details.array1),
      JSON.stringify(details.array2),
      JSON.stringify(details.array3),
      JSON.stringify(payload),
    ],
  );
}

function extractVariantRows(detailType, productId, storeCode, details) {
  const rows = [];

  if (detailType === 'regular') {
    for (const item of details.array2) {
      if (!item || typeof item !== 'object' || !item.hash) continue;
      rows.push({
        productId,
        storeCode,
        detailType,
        variantKey: String(item.hash),
        variantValue: item.value != null ? String(item.value) : null,
        rawJson: item,
      });
    }
  } else {
    for (const item of details.array1) {
      if (!item || typeof item !== 'object') continue;
      const key = `${item.option_id ?? 'na'}:${item.opt_val_id ?? 'na'}`;
      rows.push({
        productId,
        storeCode,
        detailType,
        variantKey: key,
        variantValue: item.option_val != null ? String(item.option_val) : item.label != null ? String(item.label) : null,
        rawJson: item,
      });
    }
  }

  return rows;
}

async function replaceVariantRows(client, productId, storeCode, rows) {
  await client.query('DELETE FROM sinalite_variants WHERE product_id = $1 AND store_code = $2', [productId, storeCode]);
  for (const row of rows) {
    await client.query(
      `INSERT INTO sinalite_variants
        (product_id, store_code, detail_type, variant_key, variant_value, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (product_id, store_code, variant_key) DO UPDATE SET
        detail_type = EXCLUDED.detail_type,
        variant_value = EXCLUDED.variant_value,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW();`,
      [row.productId, row.storeCode, row.detailType, row.variantKey, row.variantValue, JSON.stringify(row.rawJson)],
    );
  }
}

async function fetchProducts(config, token) {
  const response = await apiGet(config, token, 'product');
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.products)) return response.products;
  return [];
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig(args);
  const db = new Client({ connectionString: config.databaseUrl });

  const stats = {
    products: 0,
    detailCalls: 0,
    snapshots: 0,
    variants: 0,
    failures: [],
  };

  await db.connect();

  try {
    if (!args.dryRun) {
      await ensureTables(db);
    }

    const token = await getToken(config);
    let products = await fetchProducts(config, token);

    if (args.productId) {
      products = products.filter((p) => Number(p.id) === Number(args.productId));
      if (!products.length) products = [{ id: Number(args.productId) }];
    }

    if (args.limit && args.limit > 0) {
      products = products.slice(0, args.limit);
    }

    stats.products = products.length;

    for (const product of products) {
      const productId = Number(product.id);
      if (!Number.isFinite(productId)) continue;

      for (const storeCode of config.storeCodes) {
        stats.detailCalls += 1;
        try {
          const payload = await apiGet(config, token, `product/${productId}/${storeCode}`);
          if (!payload) continue;

          const details = parseDetails(payload);
          const detailType = detectType(details.array1);

          const variantRows = extractVariantRows(detailType, productId, storeCode, details);

          if (!args.dryRun) {
            await db.query('BEGIN');
            await upsertSnapshot(db, productId, storeCode, detailType, details, payload);
            await replaceVariantRows(db, productId, storeCode, variantRows);
            await db.query('COMMIT');
          }

          stats.snapshots += 1;
          stats.variants += variantRows.length;

          log('INFO', `Captured variants for product=${productId} store=${storeCode}`, {
            detailType,
            arrays: [details.array1.length, details.array2.length, details.array3.length],
            variantRows: variantRows.length,
          });
        } catch (error) {
          await db.query('ROLLBACK').catch(() => {});
          const failure = `product_id=${productId}, store_code=${storeCode}, error=${error.message}`;
          stats.failures.push(failure);
          log('ERROR', `Failed ${failure}`);
        }
      }
    }

    console.log('\n=== SINALITE VARIANT CAPTURE SUMMARY ===');
    console.log(`Products fetched: ${stats.products}`);
    console.log(`Detail calls made: ${stats.detailCalls}`);
    console.log(`Snapshots upserted: ${stats.snapshots}`);
    console.log(`Variant rows upserted: ${stats.variants}`);
    if (stats.failures.length) {
      console.log('Failures:');
      for (const f of stats.failures) console.log(` - ${f}`);
      process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error(`[FATAL] ${error.message}`);
  process.exit(1);
});
