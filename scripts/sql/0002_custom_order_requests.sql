CREATE TABLE IF NOT EXISTS custom_order_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company         TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,

  quote_number    TEXT NOT NULL,
  po              TEXT NULL,

  instructions    TEXT NULL,
  expected_date   DATE NULL,
  shipping_option TEXT NULL,
  artwork_note    TEXT NULL,

  status          TEXT NOT NULL DEFAULT 'new',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_order_requests_email ON custom_order_requests (email);
CREATE INDEX IF NOT EXISTS idx_custom_order_requests_quote_number ON custom_order_requests (quote_number);
CREATE INDEX IF NOT EXISTS idx_custom_order_requests_status ON custom_order_requests (status);
CREATE INDEX IF NOT EXISTS idx_custom_order_requests_created_at ON custom_order_requests (created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at_custom_order_requests()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_order_requests_updated_at ON custom_order_requests;
CREATE TRIGGER trg_custom_order_requests_updated_at
BEFORE UPDATE ON custom_order_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_custom_order_requests();
