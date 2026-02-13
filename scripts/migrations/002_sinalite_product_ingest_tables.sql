-- Sinalite ingestion tables for product + detail array persistence

CREATE TABLE IF NOT EXISTS sinalite_products (
  product_id bigint PRIMARY KEY,
  sku text,
  name text,
  category text,
  enabled boolean,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sinalite_product_options (
  product_id bigint NOT NULL,
  store_code text NOT NULL,
  option_id bigint NOT NULL,
  option_group text,
  option_name text,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, store_code, option_id)
);

CREATE TABLE IF NOT EXISTS sinalite_product_pricing (
  product_id bigint NOT NULL,
  store_code text NOT NULL,
  hash text NOT NULL,
  value text,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, store_code, hash)
);

CREATE TABLE IF NOT EXISTS sinalite_product_metadata (
  product_id bigint NOT NULL,
  store_code text NOT NULL,
  metadata_index integer NOT NULL,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, store_code, metadata_index)
);

CREATE TABLE IF NOT EXISTS sinalite_roll_label_options (
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
);

CREATE TABLE IF NOT EXISTS sinalite_roll_label_exclusions (
  product_id bigint NOT NULL,
  store_code text NOT NULL,
  exclusion_index integer NOT NULL,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, store_code, exclusion_index)
);

CREATE TABLE IF NOT EXISTS sinalite_roll_label_content (
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
);

CREATE INDEX IF NOT EXISTS idx_sinalite_products_category ON sinalite_products(category);
CREATE INDEX IF NOT EXISTS idx_sinalite_product_options_product_store ON sinalite_product_options(product_id, store_code);
CREATE INDEX IF NOT EXISTS idx_sinalite_product_pricing_product_store ON sinalite_product_pricing(product_id, store_code);
CREATE INDEX IF NOT EXISTS idx_sinalite_product_metadata_product_store ON sinalite_product_metadata(product_id, store_code);
CREATE INDEX IF NOT EXISTS idx_sinalite_roll_options_product_store ON sinalite_roll_label_options(product_id, store_code);
CREATE INDEX IF NOT EXISTS idx_sinalite_roll_exclusions_product_store ON sinalite_roll_label_exclusions(product_id, store_code);
CREATE INDEX IF NOT EXISTS idx_sinalite_roll_content_product_store ON sinalite_roll_label_content(product_id, store_code);
