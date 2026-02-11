-- Migration: Sinalite product ingestion tables
-- Run with: psql $DATABASE_URL -f scripts/migrations/001_sinalite_products.sql

-- Master product list (from GET /product)
CREATE TABLE IF NOT EXISTS sinalite_products (
  product_id INTEGER PRIMARY KEY,
  name TEXT,
  sku TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sinalite_products_sku ON sinalite_products (sku);

-- ─── REGULAR PRODUCTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sinalite_product_options (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  option_group TEXT NOT NULL,
  option_name TEXT NOT NULL,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, store_code, option_id)
);

CREATE INDEX IF NOT EXISTS idx_sinalite_product_options_product
  ON sinalite_product_options (product_id, store_code);

CREATE TABLE IF NOT EXISTS sinalite_product_pricing (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  hash TEXT NOT NULL,
  value TEXT NOT NULL,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, store_code, hash)
);

CREATE INDEX IF NOT EXISTS idx_sinalite_product_pricing_product
  ON sinalite_product_pricing (product_id, store_code);

CREATE TABLE IF NOT EXISTS sinalite_product_metadata (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  raw_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, store_code)
);

-- ─── ROLL LABEL PRODUCTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sinalite_roll_label_options (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  option_id INTEGER NOT NULL,
  opt_val_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  option_val TEXT NOT NULL,
  html_type TEXT,
  opt_sort_order INTEGER,
  opt_val_sort_order INTEGER,
  img_src TEXT,
  extra_turnaround_days INTEGER,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, store_code, option_id, opt_val_id)
);

CREATE INDEX IF NOT EXISTS idx_sinalite_roll_label_options_product
  ON sinalite_roll_label_options (product_id, store_code);

CREATE TABLE IF NOT EXISTS sinalite_roll_label_exclusions (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  exclusion_id INTEGER NOT NULL,
  size_id INTEGER,
  qty INTEGER,
  pricing_product_option_entity_id_1 INTEGER,
  pricing_product_option_value_entity_id_1 INTEGER,
  pricing_product_option_entity_id_2 INTEGER,
  pricing_product_option_value_entity_id_2 INTEGER,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, store_code, exclusion_id)
);

CREATE INDEX IF NOT EXISTS idx_sinalite_roll_label_exclusions_product
  ON sinalite_roll_label_exclusions (product_id, store_code);

CREATE TABLE IF NOT EXISTS sinalite_roll_label_content (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  pricing_product_option_value_entity_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  content TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, store_code, pricing_product_option_value_entity_id, content_type)
);

CREATE INDEX IF NOT EXISTS idx_sinalite_roll_label_content_product
  ON sinalite_roll_label_content (product_id, store_code);
