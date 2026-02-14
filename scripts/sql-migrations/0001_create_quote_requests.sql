-- 0001_create_quote_requests.sql
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
