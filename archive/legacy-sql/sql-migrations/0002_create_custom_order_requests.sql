-- 0002_create_custom_order_requests.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
