-- scripts/migrations/2026_02_13_sinalite_price_cache_by_chain.sql
-- Cache live POST /price results by (product_id, store_code, variant_key).
-- Stores option_chain in a stable group order (optionChain), plus the sorted variant_key.

CREATE TABLE IF NOT EXISTS sinalite_price_cache_by_chain (
  product_id INTEGER NOT NULL,
  store_code TEXT NOT NULL,

  -- Sorted numeric ids joined by '-', matching /variants keys
  variant_key TEXT NOT NULL,

  -- Ordered chain: 1 option per group in stable group order
  option_chain INTEGER[] NOT NULL,
  option_groups TEXT[] NOT NULL,

  price NUMERIC NULL,
  package_json JSONB NULL,
  product_options_json JSONB NULL,
  raw_json JSONB NULL,

  source TEXT NOT NULL DEFAULT 'live_price',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (product_id, store_code, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_spcbc_updated_at
  ON sinalite_price_cache_by_chain (updated_at);

CREATE INDEX IF NOT EXISTS idx_spcbc_product_store
  ON sinalite_price_cache_by_chain (product_id, store_code);

CREATE INDEX IF NOT EXISTS idx_spcbc_option_chain
  ON sinalite_price_cache_by_chain USING GIN (option_chain);
