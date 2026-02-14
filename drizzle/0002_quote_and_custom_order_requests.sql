-- drizzle/0002_quote_and_custom_order_requests.sql

-- Requires pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,

  product_type text NOT NULL,
  size text,
  colors text,
  material text,
  finishing text,
  quantity text,
  notes text,

  status text NOT NULL DEFAULT 'new',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_requests_created_at_idx ON quote_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS quote_requests_email_idx ON quote_requests (email);

CREATE TABLE IF NOT EXISTS custom_order_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,

  quote_number text NOT NULL,
  po text,

  instructions text,
  expected_date date,
  shipping_option text,

  artwork_note text,

  status text NOT NULL DEFAULT 'new',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_order_requests_created_at_idx ON custom_order_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS custom_order_requests_email_idx ON custom_order_requests (email);

-- Simple updated_at trigger
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quote_requests_set_updated_at ON quote_requests;
CREATE TRIGGER quote_requests_set_updated_at
BEFORE UPDATE ON quote_requests
FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

DROP TRIGGER IF EXISTS custom_order_requests_set_updated_at ON custom_order_requests;
CREATE TRIGGER custom_order_requests_set_updated_at
BEFORE UPDATE ON custom_order_requests
FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
