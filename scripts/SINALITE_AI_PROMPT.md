# Prompt: Build a Complete Sinalite → PostgreSQL Ingestion Script

Use this prompt with an AI coding assistant to generate a production-ready ingestion script.

---

You are a senior full-stack/data engineer. Build a **complete working Node.js script** that ingests Sinalite product data into PostgreSQL.

## Goal
Create an idempotent ingestion pipeline that:
1. Loads config via `.env`.
2. Connects to PostgreSQL (psql-compatible).
3. Inspects existing DB schema/tables first.
4. Creates any missing tables required for Sinalite data.
5. Calls Sinalite API endpoints.
6. Stores **all data returned in the 3 arrays** from `GET /product/:id/:storeCode` for both regular and roll-label products.
7. Upserts safely so reruns do not duplicate records.

## Tech requirements
- Runtime: Node.js (ESM JavaScript preferred; TypeScript optional if setup is included).
- Libraries: `dotenv`, `pg`, and `node-fetch` (or built-in fetch for Node 18+).
- Must run as a single CLI script (example: `node scripts/ingestSinaliteProducts.js`).

## Environment variables
Load from `.env` with dotenv:
- `DATABASE_URL` (required)
- `SINALITE_CLIENT_ID` (required)
- `SINALITE_CLIENT_SECRET` (required)
- `SINALITE_API_BASE` (optional; default `https://api.sinaliteuppy.com`)
- `SINALITE_AUTH_URL` (optional; default `${SINALITE_API_BASE}/auth/token`)
- `SINALITE_AUDIENCE` (optional; default `https://apiconnect.sinalite.com`)
- `SINALITE_STORE_CODES` (optional CSV; default `en_ca,en_us`)

## Sinalite API behavior to implement
1. **Auth token**
   - POST auth URL with JSON:
     - `client_id`
     - `client_secret`
     - `audience`
     - `grant_type=client_credentials`
   - Use `Authorization: Bearer ...` on subsequent calls.

2. **List products**
   - GET `/product`
   - Save base fields: `id`, `sku`, `name`, `category`, `enabled`, and full raw JSON.

3. **Product details by store code**
   - For each product and each store code, GET `/product/:id/:storeCode`
   - Response contains 3 arrays and differs by product type:

   ### Regular product shape
   - Array 1: option records like `{ id, group, name }`
   - Array 2: pricing records like `{ hash, value }`
   - Array 3: metadata records (varying shape)

   ### Roll label shape
   - Array 1: option definitions (`name`, `label`, `option_id`, `opt_val_id`, `option_val`, etc.)
   - Array 2: exclusions
   - Array 3: option content

4. Detect whether details response is regular vs roll-label from the array shapes and persist accordingly.

## Database requirements
### Step A: Inspect current schema first
Before creating anything, query `information_schema.tables` and `information_schema.columns` in `public` schema to see what exists.

### Step B: Create missing tables if needed
Generate `CREATE TABLE IF NOT EXISTS` SQL for these logical tables (names can be exactly these):

1. `sinalite_products`
   - `product_id` bigint primary key
   - `sku` text
   - `name` text
   - `category` text
   - `enabled` boolean
   - `raw_json` jsonb not null
   - timestamps

2. `sinalite_product_options` (regular array 1)
   - `product_id` bigint
   - `store_code` text
   - `option_id` bigint
   - `option_group` text
   - `option_name` text
   - `raw_json` jsonb not null
   - unique key on (`product_id`, `store_code`, `option_id`)

3. `sinalite_product_pricing` (regular array 2)
   - `product_id` bigint
   - `store_code` text
   - `hash` text
   - `value` numeric or text
   - `raw_json` jsonb not null
   - unique key on (`product_id`, `store_code`, `hash`)

4. `sinalite_product_metadata` (regular array 3)
   - `product_id` bigint
   - `store_code` text
   - `metadata_index` integer
   - `raw_json` jsonb not null
   - unique key on (`product_id`, `store_code`, `metadata_index`)

5. `sinalite_roll_label_options` (roll-label array 1)
   - `product_id` bigint
   - `store_code` text
   - `option_id` bigint
   - `opt_val_id` bigint
   - `name` text
   - `label` text
   - `option_val` text
   - `raw_json` jsonb not null
   - unique key on (`product_id`, `store_code`, `option_id`, `opt_val_id`)

6. `sinalite_roll_label_exclusions` (roll-label array 2)
   - `product_id` bigint
   - `store_code` text
   - `exclusion_index` integer
   - `raw_json` jsonb not null
   - unique key on (`product_id`, `store_code`, `exclusion_index`)

7. `sinalite_roll_label_content` (roll-label array 3)
   - `product_id` bigint
   - `store_code` text
   - `content_index` integer
   - `pricing_product_option_value_entity_id` bigint null
   - `content_type` text null
   - `content` text null
   - `raw_json` jsonb not null
   - unique key on (`product_id`, `store_code`, `content_index`)

Also create useful indexes on `product_id`, `store_code`, and `category`.

## Ingestion logic
- Wrap writes in transactions per product/store pair.
- Use UPSERT (`INSERT ... ON CONFLICT ... DO UPDATE`) for idempotency.
- For each product/store:
  - Optionally clear stale rows for that product/store in child tables before reinserting, OR do deterministic upserts with deletion of missing rows.
- Handle pagination if needed (if endpoint changes later).
- Add retry/backoff for transient API errors (429/5xx).
- Log progress with counts and timing.

## CLI features
Add CLI flags:
- `--dry-run` (no DB writes)
- `--limit N` (process only first N products)
- `--productId ID` (single product only)
- `--storeCodes en_ca,en_us` override env

## Output requirements
At completion, print:
- Number of products fetched.
- Number of product/store detail calls made.
- Count inserted/updated per table.
- Any failures with product id + store code.

## Deliverables
Return:
1. The complete script code.
2. SQL DDL (if separated).
3. Minimal `package.json` dependencies needed.
4. Run instructions:
   - `npm install`
   - `node scripts/ingestSinaliteProducts.js --limit 5`
5. Example verification SQL queries to confirm rows in all 7 tables.

## Important correctness constraints
- Must persist **all three arrays** from details response for every product/store.
- Must support **both regular and roll-label structures**.
- Must not crash if unknown keys appear; always keep `raw_json`.
- Must read credentials from `.env` only (no hardcoding).
- Must be production-safe for reruns.

Use clean, well-commented code and include robust error handling.
