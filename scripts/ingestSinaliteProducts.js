#!/usr/bin/env node
/**
 * scripts/ingestSinaliteProducts.js
 *
 * End-to-end ingestion pipeline for Sinalite API → PostgreSQL.
 *
 * 1) Authenticates (client credentials) to get access token
 * 2) Fetches all products from GET /product
 * 3) For each product and store (en_us, en_ca), fetches GET /product/:id/:storeCode
 * 4) Detects regular vs roll label format and upserts into normalized tables
 * 5) Idempotent: uses ON CONFLICT DO UPDATE (no truncation)
 *
 * Required env vars:
 *   DATABASE_URL (or NEON_URL, POSTGRES_URL, PGURL)
 *   SINALITE_CLIENT_ID
 *   SINALITE_CLIENT_SECRET
 *
 * Optional:
 *   SINALITE_API_BASE     (default: https://api.sinaliteuppy.com)
 *   SINALITE_AUTH_URL     (default: https://api.sinaliteuppy.com/auth/token)
 *   SINALITE_AUDIENCE     (default: https://apiconnect.sinalite.com)
 *   SINALITE_STORE_CODES  (default: en_us,en_ca)
 *
 * Usage:
 *   node scripts/ingestSinaliteProducts.js
 *   node scripts/ingestSinaliteProducts.js --limit 5
 *   node scripts/ingestSinaliteProducts.js --productId 7028
 *   node scripts/ingestSinaliteProducts.js --productId 7028 --limit 1
 *   node scripts/ingestSinaliteProducts.js --dry-run
 */

const { Client } = require("pg");

const DEFAULT_API_BASE = "https://api.sinaliteuppy.com";
const DEFAULT_AUTH_URL = "https://api.sinaliteuppy.com/auth/token";
const DEFAULT_AUDIENCE = "https://apiconnect.sinalite.com";
const DEFAULT_STORE_CODES = ["en_us", "en_ca"];
const TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const RATE_LIMIT_DELAY_MS = 200;

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}]`;
  console.log(prefix, ...args);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Auth ───────────────────────────────────────────────────────────────────
async function getAccessToken() {
  const url = pickEnv("SINALITE_AUTH_URL") || DEFAULT_AUTH_URL;
  const client_id = pickEnv("SINALITE_CLIENT_ID");
  const client_secret = pickEnv("SINALITE_CLIENT_SECRET");
  const audience = pickEnv("SINALITE_AUDIENCE") || DEFAULT_AUDIENCE;
  const grant_type = "client_credentials";

  if (!client_id || !client_secret) {
    throw new Error("Missing SINALITE_CLIENT_ID and/or SINALITE_CLIENT_SECRET");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret, audience, grant_type }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Sinalite auth failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Sinalite auth returned non-JSON`);
  }

  const token = data?.access_token;
  const type = (data?.token_type || "Bearer").trim();
  if (!token || typeof token !== "string") {
    throw new Error("Invalid Sinalite token response (missing access_token)");
  }
  return type.toLowerCase().startsWith("bearer") ? `${type} ${token}` : `Bearer ${token}`;
}

// ─── API fetch with retry + backoff ──────────────────────────────────────────
async function apiFetch(path, bearer, retries = MAX_RETRIES) {
  const base = (pickEnv("SINALITE_API_BASE", "SINALITE_BASE_URL") || DEFAULT_API_BASE).replace(
    /\/+$/,
    ""
  );
  const url = `${base}/${path.replace(/^\//, "")}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
      });

      clearTimeout(t);

      if (res.status === 429) {
        const wait = res.headers.get("Retry-After")
          ? parseInt(res.headers.get("Retry-After"), 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt);
        log("WARN", `Rate limited (429), waiting ${wait}ms before retry ${attempt}/${retries}`);
        await sleep(wait);
        continue;
      }

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        if (res.status === 404 && path.includes("/product/")) {
          return null;
        }
        throw new Error(`Sinalite ${res.status} ${res.statusText} @ ${path} - ${text.slice(0, 200)}`);
      }

      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      clearTimeout(t);
      if (attempt === retries) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log("WARN", `Attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error("Max retries exceeded");
}

// ─── Format detection ────────────────────────────────────────────────────────
function isRollLabelOption(obj) {
  if (!obj || typeof obj !== "object") return false;
  return (
    "opt_val_id" in obj &&
    "option_val" in obj &&
    "option_id" in obj &&
    "name" in obj
  );
}

function isRegularOption(obj) {
  if (!obj || typeof obj !== "object") return false;
  return "id" in obj && "group" in obj && "name" in obj && !("opt_val_id" in obj);
}

function detectFormat(arr1) {
  if (!Array.isArray(arr1) || arr1.length === 0) return "unknown";
  const first = arr1[0];
  if (isRollLabelOption(first)) return "roll_label";
  if (isRegularOption(first)) return "regular";
  return "unknown";
}

// ─── Parse response arrays ───────────────────────────────────────────────────
function parsePayload(payload) {
  let arr1 = [];
  let arr2 = [];
  let arr3 = [];

  if (Array.isArray(payload)) {
    arr1 = Array.isArray(payload[0]) ? payload[0] : [];
    arr2 = Array.isArray(payload[1]) ? payload[1] : [];
    arr3 = Array.isArray(payload[2]) ? payload[2] : [];
  } else if (payload && typeof payload === "object") {
    arr1 = Array.isArray(payload.options) ? payload.options : [];
    arr2 = Array.isArray(payload.pricing) ? payload.pricing : [];
    arr3 = Array.isArray(payload.meta) ? payload.meta : [];
  }

  return { arr1, arr2, arr3 };
}

// ─── Upserts (raw SQL) ───────────────────────────────────────────────────────
async function upsertProduct(client, product) {
  const id = product?.id ?? product?.product_id;
  if (id == null) return;

  const name = product?.name ?? null;
  const sku = product?.sku ?? null;
  const raw = JSON.stringify(product ?? {});

  await client.query(
    `
    INSERT INTO sinalite_products (product_id, name, sku, raw_json, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, NOW())
    ON CONFLICT (product_id) DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      raw_json = EXCLUDED.raw_json,
      updated_at = NOW()
    `,
    [Number(id), name, sku, raw]
  );
}

async function upsertRegularProduct(client, productId, storeCode, arr1, arr2, arr3) {
  const pid = Number(productId);
  const sc = String(storeCode);

  for (const row of arr1 || []) {
    if (!row || typeof row !== "object" || !("id" in row) || !("group" in row) || !("name" in row))
      continue;
    const optionId = Number(row.id);
    const optionGroup = String(row.group ?? "").trim() || "unknown";
    const optionName = String(row.name ?? "").trim() || "";
    const raw = JSON.stringify(row);

    await client.query(
      `
      INSERT INTO sinalite_product_options
        (product_id, store_code, option_id, option_group, option_name, raw_json, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      ON CONFLICT (product_id, store_code, option_id) DO UPDATE SET
        option_group = EXCLUDED.option_group,
        option_name = EXCLUDED.option_name,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
      `,
      [pid, sc, optionId, optionGroup, optionName, raw]
    );
  }

  for (const row of arr2 || []) {
    if (!row || typeof row !== "object" || !("hash" in row)) continue;
    const hash = String(row.hash ?? "").trim();
    if (!hash) continue;
    const value = String(row.value ?? "").trim();
    const raw = JSON.stringify(row);

    await client.query(
      `
      INSERT INTO sinalite_product_pricing
        (product_id, store_code, hash, value, raw_json, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (product_id, store_code, hash) DO UPDATE SET
        value = EXCLUDED.value,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
      `,
      [pid, sc, hash, value, raw]
    );
  }

  const metaRaw = JSON.stringify(Array.isArray(arr3) ? arr3 : arr3 ? [arr3] : []);
  await client.query(
    `
    INSERT INTO sinalite_product_metadata (product_id, store_code, raw_json, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (product_id, store_code) DO UPDATE SET
      raw_json = EXCLUDED.raw_json,
      updated_at = NOW()
    `,
    [pid, sc, metaRaw]
  );
}

async function upsertRollLabelProduct(client, productId, storeCode, arr1, arr2, arr3) {
  const pid = Number(productId);
  const sc = String(storeCode);

  for (const row of arr1 || []) {
    if (!row || typeof row !== "object" || !("opt_val_id" in row) || !("option_id" in row))
      continue;
    const optionId = Number(row.option_id);
    const optValId = Number(row.opt_val_id);
    const name = String(row.name ?? "").trim() || "unknown";
    const label = String(row.label ?? row.name ?? "").trim() || name;
    const optionVal = String(row.option_val ?? "").trim() || "";
    const htmlType = row.html_type != null ? String(row.html_type) : null;
    const optSortOrder = row.opt_sort_order != null ? Number(row.opt_sort_order) : null;
    const optValSortOrder = row.opt_val_sort_order != null ? Number(row.opt_val_sort_order) : null;
    const imgSrc = row.img_src != null ? String(row.img_src) : null;
    const extraTurnaroundDays =
      row.extra_turnaround_days != null ? Number(row.extra_turnaround_days) : null;
    const raw = JSON.stringify(row);

    await client.query(
      `
      INSERT INTO sinalite_roll_label_options (
        product_id, store_code, option_id, opt_val_id, name, label, option_val,
        html_type, opt_sort_order, opt_val_sort_order, img_src, extra_turnaround_days, raw_json, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
      ON CONFLICT (product_id, store_code, option_id, opt_val_id) DO UPDATE SET
        name = EXCLUDED.name,
        label = EXCLUDED.label,
        option_val = EXCLUDED.option_val,
        html_type = EXCLUDED.html_type,
        opt_sort_order = EXCLUDED.opt_sort_order,
        opt_val_sort_order = EXCLUDED.opt_val_sort_order,
        img_src = EXCLUDED.img_src,
        extra_turnaround_days = EXCLUDED.extra_turnaround_days,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
      `,
      [
        pid,
        sc,
        optionId,
        optValId,
        name,
        label,
        optionVal,
        htmlType,
        optSortOrder,
        optValSortOrder,
        imgSrc,
        extraTurnaroundDays,
        raw,
      ]
    );
  }

  let exclusionId = 0;
  for (const row of arr2 || []) {
    if (!row || typeof row !== "object") continue;
    exclusionId++;
    const sizeId = row.size_id != null ? Number(row.size_id) : null;
    const qty = row.qty != null ? Number(row.qty) : null;
    const e1 = row.pricing_product_option_entity_id_1 != null
      ? Number(row.pricing_product_option_entity_id_1)
      : null;
    const v1 = row.pricing_product_option_value_entity_id_1 != null
      ? Number(row.pricing_product_option_value_entity_id_1)
      : null;
    const e2 = row.pricing_product_option_entity_id_2 != null
      ? Number(row.pricing_product_option_entity_id_2)
      : null;
    const v2 = row.pricing_product_option_value_entity_id_2 != null
      ? Number(row.pricing_product_option_value_entity_id_2)
      : null;
    const raw = JSON.stringify(row);

    await client.query(
      `
      INSERT INTO sinalite_roll_label_exclusions (
        product_id, store_code, exclusion_id, size_id, qty,
        pricing_product_option_entity_id_1, pricing_product_option_value_entity_id_1,
        pricing_product_option_entity_id_2, pricing_product_option_value_entity_id_2,
        raw_json, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      ON CONFLICT (product_id, store_code, exclusion_id) DO UPDATE SET
        size_id = EXCLUDED.size_id,
        qty = EXCLUDED.qty,
        pricing_product_option_entity_id_1 = EXCLUDED.pricing_product_option_entity_id_1,
        pricing_product_option_value_entity_id_1 = EXCLUDED.pricing_product_option_value_entity_id_1,
        pricing_product_option_entity_id_2 = EXCLUDED.pricing_product_option_entity_id_2,
        pricing_product_option_value_entity_id_2 = EXCLUDED.pricing_product_option_value_entity_id_2,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
      `,
      [pid, sc, exclusionId, sizeId, qty, e1, v1, e2, v2, raw]
    );
  }

  for (const row of arr3 || []) {
    if (!row || typeof row !== "object") continue;
    const valId = row.pricing_product_option_value_entity_id;
    const contentType = String(row.content_type ?? "unknown").trim() || "unknown";
    const content = row.content != null ? String(row.content) : null;
    const raw = JSON.stringify(row);

    if (valId == null) continue;

    await client.query(
      `
      INSERT INTO sinalite_roll_label_content (
        product_id, store_code, pricing_product_option_value_entity_id, content_type, content, raw_json, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      ON CONFLICT (product_id, store_code, pricing_product_option_value_entity_id, content_type) DO UPDATE SET
        content = EXCLUDED.content,
        raw_json = EXCLUDED.raw_json,
        updated_at = NOW()
      `,
      [pid, sc, Number(valId), contentType, content, raw]
    );
  }
}

// ─── Main ingest logic ───────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1]
    ? parseInt(args[limitIdx + 1], 10)
    : null;
  const productIdIdx = args.indexOf("--productId");
  const filterProductId =
    productIdIdx >= 0 && args[productIdIdx + 1]
      ? parseInt(args[productIdIdx + 1], 10)
      : null;
  const dryRun = args.includes("--dry-run");

  const dbUrl =
    pickEnv("DATABASE_URL", "NEON_URL", "POSTGRES_URL", "PGURL") || null;

  if (!dbUrl) {
    log("ERROR", "Missing DATABASE_URL (or NEON_URL / POSTGRES_URL / PGURL)");
    process.exit(1);
  }

  const storeCodesRaw = pickEnv("SINALITE_STORE_CODES");
  const storeCodes = storeCodesRaw
    ? storeCodesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_STORE_CODES;

  if (dryRun) {
    log("INFO", "DRY RUN – no DB writes");
  }

  log("INFO", "Starting Sinalite ingestion", {
    limit: limit ?? "none",
    productId: filterProductId ?? "all",
    storeCodes,
    dryRun,
  });

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  let bearer;
  try {
    bearer = await getAccessToken();
    log("INFO", "Auth OK");
  } catch (err) {
    log("ERROR", "Auth failed:", err.message);
    process.exit(1);
  }

  let products = [];
  if (filterProductId) {
    products = [{ id: filterProductId }];
    log("INFO", "Filtering to productId", filterProductId);
  } else {
    try {
      const raw = await apiFetch("product", bearer);
      if (Array.isArray(raw)) {
        products = raw;
      } else if (raw && Array.isArray(raw.products)) {
        products = raw.products;
      } else if (raw && typeof raw === "object" && "id" in raw) {
        products = [raw];
      } else {
        log(
          "WARN",
          "GET /product returned unexpected shape. Trying storefront catalog as fallback..."
        );
        const categories = await apiFetch("storefront/en_us/categories", bearer).catch(() => []);
        const catList = Array.isArray(categories) ? categories : [];
        for (const cat of catList) {
          const cid = cat?.id ?? cat?.category_id;
          if (cid == null) continue;
          const subs = await apiFetch(
            `storefront/en_us/categories/${cid}/subcategories`,
            bearer
          ).catch(() => []);
          const subList = Array.isArray(subs) ? subs : [];
          for (const sub of subList) {
            const sid = sub?.id ?? sub?.subcategory_id;
            if (sid == null) continue;
            const prods = await apiFetch(
              `storefront/en_us/subcategories/${sid}/products`,
              bearer
            ).catch(() => []);
            const pList = Array.isArray(prods) ? prods : [];
            for (const p of pList) {
              const pid = p?.id ?? p?.product_id;
              if (pid != null && !products.some((x) => (x.id ?? x.product_id) === pid)) {
                products.push(p);
              }
            }
          }
        }
        if (products.length === 0) {
          log("ERROR", "No products found. Check SINALITE_API_BASE and GET /product response shape.");
          process.exit(1);
        }
        log("INFO", "Collected", products.length, "products from storefront catalog");
      }
    } catch (err) {
      log("ERROR", "Failed to fetch product list:", err.message);
      process.exit(1);
    }
  }

  const toProcess = limit ? products.slice(0, limit) : products;
  log("INFO", "Processing", toProcess.length, "products");

  let processed = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < toProcess.length; i++) {
    const p = toProcess[i];
    const productId = p?.id ?? p?.product_id ?? p;
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid < 1) continue;

    for (const storeCode of storeCodes) {
      try {
        if (!dryRun) {
          await upsertProduct(client, p);
        }

        const payload = await apiFetch(`product/${pid}/${storeCode}`, bearer);
        if (!payload) {
          log("WARN", `Product ${pid} / ${storeCode}: 404 or empty, skipping`);
          continue;
        }

        const { arr1, arr2, arr3 } = parsePayload(payload);
        const format = detectFormat(arr1);

        if (format === "unknown") {
          log("WARN", `Product ${pid} / ${storeCode}: unknown format, skipping`);
          continue;
        }

        if (!dryRun) {
          if (format === "regular") {
            await upsertRegularProduct(client, pid, storeCode, arr1, arr2, arr3);
          } else {
            await upsertRollLabelProduct(client, pid, storeCode, arr1, arr2, arr3);
          }
        }

        log("INFO", `[${i + 1}/${toProcess.length}] ${pid} / ${storeCode} → ${format}`);
        processed++;
      } catch (err) {
        failed++;
        const msg = `Product ${pid} / ${storeCode}: ${err.message}`;
        errors.push(msg);
        log("ERROR", msg);
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  await client.end();

  log("INFO", "Done. Processed:", processed, "Failed:", failed);
  if (errors.length) {
    log("ERROR", "Errors:", errors.join("; "));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
