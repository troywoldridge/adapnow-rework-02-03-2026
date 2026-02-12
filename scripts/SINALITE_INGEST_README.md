# Sinalite Product Ingestion Pipeline

End-to-end ingestion from Sinalite API into PostgreSQL. Supports both **regular products** and **roll label** formats.

## Response Shapes (Inferred)

### Regular Products (`GET /product/:id/:storeCode`)

Returns 3 arrays:

| Array | Shape | Example |
|-------|-------|---------|
| 1 (options) | `{ id, group, name }` | `{ "id": 4, "group": "size", "name": "3.5 x 2" }` |
| 2 (pricing) | `{ hash, value }` | `{ "hash": "0355...", "value": "0.02" }` |
| 3 (metadata) | varies | Raw JSONB stored |

### Roll Label Products

| Array | Shape | Example |
|-------|-------|---------|
| 1 (options) | `{ name, label, option_id, opt_val_id, option_val, html_type, opt_sort_order, ... }` | Option definitions |
| 2 (exclusions) | `{ product_id, size_id, qty, pricing_product_option_entity_id_1, ... }` | Exclusions |
| 3 (content) | `{ pricing_product_option_value_entity_id, product_id, content_type, content }` | Option content |

## Tables

| Table | Purpose |
|-------|---------|
| `sinalite_products` | Master list from GET /product |
| `sinalite_product_options` | Regular: option_id, option_group, option_name |
| `sinalite_product_pricing` | Regular: hash, value |
| `sinalite_product_metadata` | Regular: raw JSONB per product+store |
| `sinalite_roll_label_options` | Roll label: option definitions |
| `sinalite_roll_label_exclusions` | Roll label: exclusions |
| `sinalite_roll_label_content` | Roll label: option content |

---

## Required Environment Variables

```
DATABASE_URL=postgresql://user:pass@host:5432/db
SINALITE_CLIENT_ID=your_client_id
SINALITE_CLIENT_SECRET=your_client_secret
```

## Optional Environment Variables

```
SINALITE_API_BASE=https://api.sinaliteuppy.com    # or live URL
SINALITE_AUTH_URL=https://api.sinaliteuppy.com/auth/token
SINALITE_AUDIENCE=https://apiconnect.sinalite.com
SINALITE_STORE_CODES=en_us,en_ca
```

For DB connection, any of these work: `DATABASE_URL`, `NEON_URL`, `POSTGRES_URL`, `PGURL`.

---

## Commands

### 1. Run migrations

Sinalite tables are managed by Drizzle. Apply migrations:

```bash
DATABASE_URL=postgresql://... pnpm db:migrate
```

Or push schema directly (dev only):

```bash
DATABASE_URL=postgresql://... pnpm db:push
```

### 2. Verify auth (optional)

```bash
node scripts/sinaliteAuth.js
node scripts/sinaliteAuth.js --json
```

### 3. Run full ingest

```bash
node scripts/ingestSinaliteProducts.js
```

### 4. Test with limit

```bash
node scripts/ingestSinaliteProducts.js --limit 5
```

### 5. Ingest single product

```bash
node scripts/ingestSinaliteProducts.js --productId 7028
```

### 6. Dry run (no DB writes)

```bash
node scripts/ingestSinaliteProducts.js --dry-run
```

---

## Verification Queries

### Row counts

```sql
SELECT 'sinalite_products' AS tbl, COUNT(*) AS cnt FROM sinalite_products
UNION ALL
SELECT 'sinalite_product_options', COUNT(*) FROM sinalite_product_options
UNION ALL
SELECT 'sinalite_product_pricing', COUNT(*) FROM sinalite_product_pricing
UNION ALL
SELECT 'sinalite_product_metadata', COUNT(*) FROM sinalite_product_metadata
UNION ALL
SELECT 'sinalite_roll_label_options', COUNT(*) FROM sinalite_roll_label_options
UNION ALL
SELECT 'sinalite_roll_label_exclusions', COUNT(*) FROM sinalite_roll_label_exclusions
UNION ALL
SELECT 'sinalite_roll_label_content', COUNT(*) FROM sinalite_roll_label_content;
```

### Products by store

```sql
SELECT store_code, COUNT(*) AS option_count
FROM sinalite_product_options
GROUP BY store_code;

SELECT store_code, COUNT(*) AS option_count
FROM sinalite_roll_label_options
GROUP BY store_code;
```

### Sample data

```sql
SELECT * FROM sinalite_products LIMIT 5;
SELECT * FROM sinalite_product_options WHERE product_id = 7028 AND store_code = 'en_us';
SELECT * FROM sinalite_roll_label_options WHERE product_id = 7028 AND store_code = 'en_us' LIMIT 5;
```
