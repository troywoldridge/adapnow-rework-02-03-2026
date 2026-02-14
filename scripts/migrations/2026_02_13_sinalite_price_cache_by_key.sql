-- scripts/migrations/2026_02_13_sinalite_price_cache_by_key.sql
-- Cache live POST /price results by (product_id, store_code, key).

CREATE TABLE IF NOT EXISTS sinalite_price_cache_by_key (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  key TEXT NOT NULL,
  option_ids INTEGER[] NOT NULL,

  price NUMERIC NULL,

  package_json JSONB NULL,
  product_options_json JSONB NULL,
  raw_json JSONB NULL,

  source TEXT NOT NULL DEFAULT 'live_price',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (product_id, store_code, key)
);

CREATE INDEX IF NOT EXISTS idx_spcbk_updated_at
  ON sinalite_price_cache_by_key (updated_at);

CREATE INDEX IF NOT EXISTS idx_spcbk_product_store
  ON sinalite_price_cache_by_key (product_id, store_code);

CREATE INDEX IF NOT EXISTS idx_spcbk_option_ids
  ON sinalite_price_cache_by_key USING GIN (option_ids);
