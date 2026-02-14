CREATE TABLE IF NOT EXISTS quote_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name            TEXT NOT NULL,
  company         TEXT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NULL,

  product_type    TEXT NOT NULL,
  size            TEXT NULL,
  colors          TEXT NULL,
  material        TEXT NULL,
  finishing       TEXT NULL,
  quantity        TEXT NULL,
  notes           TEXT NULL,

  status          TEXT NOT NULL DEFAULT 'new',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_quote_requests_email ON quote_requests (email);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests (status);
CREATE INDEX IF NOT EXISTS idx_quote_requests_created_at ON quote_requests (created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at_quote_requests()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quote_requests_updated_at ON quote_requests;
CREATE TRIGGER trg_quote_requests_updated_at
BEFORE UPDATE ON quote_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_quote_requests();
