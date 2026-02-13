#!/usr/bin/env node

const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config();

const DEFAULT_API_BASE = 'https://api.sinaliteuppy.com';
const DEFAULT_AUDIENCE = 'https://apiconnect.sinalite.com';
const DEFAULT_STORE_CODES = ['en_ca', 'en_us'];
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 800;

const TABLES = {
  products: 'sinalite_products',
  options: 'sinalite_product_options',
  pricing: 'sinalite_product_pricing',
  metadata: 'sinalite_product_metadata',
  rollOptions: 'sinalite_roll_label_options',
  rollExclusions: 'sinalite_roll_label_exclusions',
  rollContent: 'sinalite_roll_label_content',
};

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ${TABLES.products} (
      product_id bigint PRIMARY KEY,
      sku text,
      name text,
      category text,
      enabled boolean,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.options} (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      option_id bigint NOT NULL,
      option_group text,
      option_name text,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, store_code, option_id)
    );`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.pricing} (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      hash text NOT NULL,
      value text,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, store_code, hash)
    );`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.metadata} (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      metadata_index integer NOT NULL,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, store_code, metadata_index)
    );`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.rollOptions} (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      option_id bigint,
      opt_val_id bigint,
      name text,
      label text,
      option_val text,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, store_code, option_id, opt_val_id)
    );`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.rollExclusions} (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      exclusion_index integer NOT NULL,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, store_code, exclusion_index)
    );`,
  `CREATE TABLE IF NOT EXISTS ${TABLES.rollContent} (
      product_id bigint NOT NULL,
      store_code text NOT NULL,
      content_index integer NOT NULL,
      pricing_product_option_value_entity_id bigint,
      content_type text,
      content text,
      raw_json jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, store_code, content_index)
    );`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_products_category ON ${TABLES.products}(category);`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_product_options_product_store ON ${TABLES.options}(product_id, store_code);`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_product_pricing_product_store ON ${TABLES.pricing}(product_id, store_code);`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_product_metadata_product_store ON ${TABLES.metadata}(product_id, store_code);`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_roll_options_product_store ON ${TABLES.rollOptions}(product_id, store_code);`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_roll_exclusions_product_store ON ${TABLES.rollExclusions}(product_id, store_code);`,
  `CREATE INDEX IF NOT EXISTS idx_sinalite_roll_content_product_store ON ${TABLES.rollContent}(product_id, store_code);`,
];

function nowIso() {
  return new Date().toISOString();
}

function log(level, message, data) {
  if (data !== undefined) {
    console.log(`[${nowIso()}] [${level}] ${message}`, data);
    return;
  }
  console.log(`[${nowIso()}] [${level}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, productId: null, storeCodes: null };
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function getConfig(args) {
  const apiBase = (process.env.SINALITE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
  return {
    databaseUrl: requiredEnv('DATABASE_URL'),
    clientId: requiredEnv('SINALITE_CLIENT_ID'),
    clientSecret: requiredEnv('SINALITE_CLIENT_SECRET'),
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

async function fetchWithRetry(url, options = {}, retryCount = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (attempt < retryCount) {
          log('WARN', `Transient ${response.status} for ${url}. Retrying in ${waitMs}ms (${attempt}/${retryCount})`);
          await sleep(waitMs);
          continue;
        }
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt >= retryCount) {
        throw error;
      }
      const waitMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log('WARN', `Request error for ${url}: ${error.message}. Retrying in ${waitMs}ms (${attempt}/${retryCount})`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

async function getAccessToken(config) {
  const response = await fetchWithRetry(config.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
      grant_type: 'client_credentials',
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Auth failed (${response.status}): ${text.slice(0, 250)}`);
  }

  const parsed = JSON.parse(text);
  if (!parsed.access_token) {
    throw new Error('Auth response missing access_token');
  }
  return `Bearer ${parsed.access_token}`;
}

async function apiGet(config, token, path, searchParams = null) {
  const query = searchParams ? `?${new URLSearchParams(searchParams).toString()}` : '';
  const url = `${config.apiBase}/${path.replace(/^\//, '')}${query}`;
  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      Authorization: token,
      Accept: 'application/json',
    },
  });

  const bodyText = await response.text();
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status}): ${bodyText.slice(0, 250)}`);
  }

  if (!bodyText) return null;
  return JSON.parse(bodyText);
}

function parseDetailsPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      array1: Array.isArray(payload[0]) ? payload[0] : [],
      array2: Array.isArray(payload[1]) ? payload[1] : [],
      array3: Array.isArray(payload[2]) ? payload[2] : [],
    };
  }

  const candidateArrays = Object.values(payload || {}).filter(Array.isArray);
  return {
    array1: candidateArrays[0] || [],
    array2: candidateArrays[1] || [],
    array3: candidateArrays[2] || [],
  };
}

function detectDetailsType(array1) {
  const sample = Array.isArray(array1) ? array1.find((item) => item && typeof item === 'object') : null;
  if (!sample) return 'regular';
  if ('opt_val_id' in sample || 'option_val' in sample) return 'roll-label';
  return 'regular';
}

async function inspectSchema(client) {
  if (!process.env.SINALITE_DEBUG_SCHEMA) {
    return;
  }

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  const columns = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const summary = {};
  for (const row of columns.rows) {
    if (!summary[row.table_name]) summary[row.table_name] = [];
    summary[row.table_name].push(`${row.column_name}:${row.data_type}`);
  }
}

  log('INFO', `Schema inspection found ${tables.rowCount} public tables.`);
  for (const table of tables.rows) {
    log('INFO', ` - ${table.table_name}`, summary[table.table_name] || []);
  }
}

async function ensureTables(client) {
  for (const statement of DDL_STATEMENTS) {
    await client.query(statement);
  }
}

function createStats() {
  const stats = {};
  Object.values(TABLES).forEach((tableName) => {
    stats[tableName] = { inserted: 0, updated: 0 };
  });
  return stats;
}

function updateStat(stats, tableName, inserted) {
  if (inserted) stats[tableName].inserted += 1;
  else stats[tableName].updated += 1;
}

async function upsertProduct(client, product, stats) {
  const result = await client.query(
    `INSERT INTO ${TABLES.products}
      (product_id, sku, name, category, enabled, raw_json, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (product_id) DO UPDATE SET
      sku = EXCLUDED.sku,
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      enabled = EXCLUDED.enabled,
      raw_json = EXCLUDED.raw_json,
      updated_at = NOW()
     RETURNING (xmax = 0) AS inserted;`,
    [product.id, product.sku ?? null, product.name ?? null, product.category ?? null, product.enabled ?? null, JSON.stringify(product)],
  );
  updateStat(stats, TABLES.products, result.rows[0].inserted);
}

async function clearRegularTables(client, productId, storeCode) {
  await client.query(`DELETE FROM ${TABLES.options} WHERE product_id = $1 AND store_code = $2`, [productId, storeCode]);
  await client.query(`DELETE FROM ${TABLES.pricing} WHERE product_id = $1 AND store_code = $2`, [productId, storeCode]);
  await client.query(`DELETE FROM ${TABLES.metadata} WHERE product_id = $1 AND store_code = $2`, [productId, storeCode]);
}

async function clearRollTables(client, productId, storeCode) {
  await client.query(`DELETE FROM ${TABLES.rollOptions} WHERE product_id = $1 AND store_code = $2`, [productId, storeCode]);
  await client.query(`DELETE FROM ${TABLES.rollExclusions} WHERE product_id = $1 AND store_code = $2`, [productId, storeCode]);
  await client.query(`DELETE FROM ${TABLES.rollContent} WHERE product_id = $1 AND store_code = $2`, [productId, storeCode]);
}

async function ingestRegular(client, productId, storeCode, details, stats) {
  await clearRegularTables(client, productId, storeCode);
  await clearRollTables(client, productId, storeCode);

  for (const row of details.array1) {
    const result = await client.query(
      `INSERT INTO ${TABLES.options}
        (product_id, store_code, option_id, option_group, option_name, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (product_id, store_code, option_id) DO UPDATE SET
        option_group = EXCLUDED.option_group,
        option_name = EXCLUDED.option_name,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
       RETURNING (xmax = 0) AS inserted;`,
      [productId, storeCode, Number(row.id ?? 0), row.group ?? null, row.name ?? null, JSON.stringify(row)],
    );
    updateStat(stats, TABLES.options, result.rows[0].inserted);
  }

  for (const row of details.array2) {
    const hash = row?.hash;
    if (!hash) continue;
    const result = await client.query(
      `INSERT INTO ${TABLES.pricing}
        (product_id, store_code, hash, value, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (product_id, store_code, hash) DO UPDATE SET
        value = EXCLUDED.value,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
       RETURNING (xmax = 0) AS inserted;`,
      [productId, storeCode, String(hash), row?.value != null ? String(row.value) : null, JSON.stringify(row)],
    );
    updateStat(stats, TABLES.pricing, result.rows[0].inserted);
  }

  for (let i = 0; i < details.array3.length; i += 1) {
    const row = details.array3[i];
    const result = await client.query(
      `INSERT INTO ${TABLES.metadata}
        (product_id, store_code, metadata_index, raw_json, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (product_id, store_code, metadata_index) DO UPDATE SET
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
       RETURNING (xmax = 0) AS inserted;`,
      [productId, storeCode, i, JSON.stringify(row)],
    );
    updateStat(stats, TABLES.metadata, result.rows[0].inserted);
  }
}

async function ingestRollLabel(client, productId, storeCode, details, stats) {
  await clearRollTables(client, productId, storeCode);
  await clearRegularTables(client, productId, storeCode);

  for (const row of details.array1) {
    const result = await client.query(
      `INSERT INTO ${TABLES.rollOptions}
        (product_id, store_code, option_id, opt_val_id, name, label, option_val, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
       ON CONFLICT (product_id, store_code, option_id, opt_val_id) DO UPDATE SET
        name = EXCLUDED.name,
        label = EXCLUDED.label,
        option_val = EXCLUDED.option_val,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
       RETURNING (xmax = 0) AS inserted;`,
      [
        productId,
        storeCode,
        row.option_id != null ? Number(row.option_id) : null,
        row.opt_val_id != null ? Number(row.opt_val_id) : null,
        row.name ?? null,
        row.label ?? null,
        row.option_val ?? null,
        JSON.stringify(row),
      ],
    );
    updateStat(stats, TABLES.rollOptions, result.rows[0].inserted);
  }

  for (let i = 0; i < details.array2.length; i += 1) {
    const row = details.array2[i];
    const result = await client.query(
      `INSERT INTO ${TABLES.rollExclusions}
        (product_id, store_code, exclusion_index, raw_json, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (product_id, store_code, exclusion_index) DO UPDATE SET
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
       RETURNING (xmax = 0) AS inserted;`,
      [productId, storeCode, i, JSON.stringify(row)],
    );
    updateStat(stats, TABLES.rollExclusions, result.rows[0].inserted);
  }

  for (let i = 0; i < details.array3.length; i += 1) {
    const row = details.array3[i];
    const result = await client.query(
      `INSERT INTO ${TABLES.rollContent}
        (product_id, store_code, content_index, pricing_product_option_value_entity_id, content_type, content, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       ON CONFLICT (product_id, store_code, content_index) DO UPDATE SET
        pricing_product_option_value_entity_id = EXCLUDED.pricing_product_option_value_entity_id,
        content_type = EXCLUDED.content_type,
        content = EXCLUDED.content,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
       RETURNING (xmax = 0) AS inserted;`,
      [
        productId,
        storeCode,
        i,
        row?.pricing_product_option_value_entity_id != null
          ? Number(row.pricing_product_option_value_entity_id)
          : null,
        row?.content_type ?? null,
        row?.content != null ? String(row.content) : null,
        JSON.stringify(row),
      ],
    );
    updateStat(stats, TABLES.rollContent, result.rows[0].inserted);
  }
}

async function fetchProducts(config, token) {
  const direct = await apiGet(config, token, 'product');
  if (Array.isArray(direct)) return direct;
  if (direct?.products && Array.isArray(direct.products)) return direct.products;

  if (direct && typeof direct === 'object') {
    const gathered = [];
    let page = 1;
    while (true) {
      const pageResult = page === 1 ? direct : await apiGet(config, token, 'product', { page, per_page: 100 });
      const rows = Array.isArray(pageResult)
        ? pageResult
        : Array.isArray(pageResult?.products)
          ? pageResult.products
          : [];
      gathered.push(...rows);
      const hasNext =
        Number.isFinite(Number(pageResult?.total_pages)) && page < Number(pageResult.total_pages);
      if (!hasNext || rows.length === 0) break;
      page += 1;
    }
    return gathered;
  }

  return [];
}

async function ingest() {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig(args);
  const start = Date.now();
  const client = new Client({ connectionString: config.databaseUrl });
  const stats = createStats();
  let detailCalls = 0;
  const failures = [];

  await client.connect();

  try {
    log('INFO', 'Starting Sinalite ingestion', {
      dryRun: args.dryRun,
      limit: args.limit,
      productId: args.productId,
      storeCodes: config.storeCodes,
      apiBase: config.apiBase,
    });

    await inspectSchema(client);
    if (!args.dryRun) {
      await ensureTables(client);
      log('INFO', 'Ensured Sinalite tables and indexes exist.');
    } else {
      log('INFO', 'Dry run enabled; skipping DDL and writes.');
    }

    const token = await getAccessToken(config);
    log('INFO', 'Obtained access token.');

    let products = await fetchProducts(config, token);
    if (args.productId) {
      products = products.filter((p) => Number(p.id) === Number(args.productId));
      if (!products.length) {
        products = [{ id: args.productId }];
      }
    }

    if (args.limit && args.limit > 0) {
      products = products.slice(0, args.limit);
    }

    log('INFO', `Fetched ${products.length} products from /product.`);

    for (const product of products) {
      const productId = Number(product.id);
      if (!Number.isFinite(productId)) continue;
      if (!args.dryRun) {
        await upsertProduct(client, product, stats);
      }

      for (const storeCode of config.storeCodes) {
        const pairStart = Date.now();
        detailCalls += 1;
        try {
          const detailsPayload = await apiGet(config, token, `product/${productId}/${storeCode}`);
          if (!detailsPayload) {
            log('WARN', `No detail payload for product=${productId} store=${storeCode}`);
            continue;
          }

          const details = parseDetailsPayload(detailsPayload);
          const kind = detectDetailsType(details.array1);

          if (!args.dryRun) {
            await client.query('BEGIN');
            if (kind === 'roll-label') {
              await ingestRollLabel(client, productId, storeCode, details, stats);
            } else {
              await ingestRegular(client, productId, storeCode, details, stats);
            }
            await client.query('COMMIT');
          }

          log('INFO', `Processed product=${productId} store=${storeCode} kind=${kind} arrays=[${details.array1.length},${details.array2.length},${details.array3.length}] in ${Date.now() - pairStart}ms`);
        } catch (error) {
          failures.push({ productId, storeCode, error: error.message });
          await client.query('ROLLBACK').catch(() => {});
          log('ERROR', `Failed product=${productId} store=${storeCode}: ${error.message}`);
        }
      }
    }

    const elapsed = Date.now() - start;
    log('INFO', `Completed ingestion in ${elapsed}ms.`);

    console.log('\n=== INGESTION SUMMARY ===');
    console.log(`Products fetched: ${products.length}`);
    console.log(`Detail calls made: ${detailCalls}`);
    console.log('Per-table inserted/updated counts:');
    for (const [tableName, count] of Object.entries(stats)) {
      console.log(` - ${tableName}: inserted=${count.inserted}, updated=${count.updated}`);
    }
    if (failures.length > 0) {
      console.log('Failures:');
      for (const failure of failures) {
        console.log(` - product_id=${failure.productId}, store_code=${failure.storeCode}, error=${failure.error}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

ingest().catch((error) => {
  console.error(`[${nowIso()}] [FATAL] ${error.message}`);
  process.exit(1);
});
