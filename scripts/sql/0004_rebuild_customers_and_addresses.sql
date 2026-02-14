-- scripts/sql/000X_rebuild_customers_and_addresses.sql
-- Future-proof rebuild for customers + customer_addresses (Postgres)
-- Safe for dev. In prod, you'd do a phased migration/backfill.

BEGIN;

-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- 2) updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Drop old tables (addresses first because FK)
DROP TABLE IF EXISTS customer_addresses CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- 4) Recreate customers
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- External identity
  clerk_user_id text NOT NULL,

  -- Contact
  email citext NULL,

  -- Names
  first_name text NULL,
  last_name text NULL,
  display_name text NULL,

  -- Phone (PII): store encrypted + last4 for UI
  phone_enc text NULL,
  phone_last4 text NULL,

  -- Customer flags / RBAC
  marketing_opt_in boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'customer',

  -- Flexible future-proof storage for edge cases
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

-- Constraints / indexes
ALTER TABLE customers
  ADD CONSTRAINT uniq_customers_clerk_user_id UNIQUE (clerk_user_id);

-- Unique email when present (prevents duplicates, but allows null)
CREATE UNIQUE INDEX uniq_customers_email_not_null
  ON customers (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_customers_email
  ON customers (email);

CREATE INDEX idx_customers_created_at
  ON customers (created_at);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 5) Recreate customer_addresses
CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Optional label like "Home", "Office"
  label text NULL,

  -- Recipient fields (can differ from customer)
  first_name text NULL,
  last_name text NULL,
  company text NULL,

  -- Optional email at address level (useful for billing contacts)
  email citext NULL,

  -- Phone (encrypted)
  phone_enc text NULL,
  phone_last4 text NULL,

  -- Address lines
  street1 text NOT NULL,
  street2 text NULL,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL,

  -- Defaults (separate shipping vs billing)
  is_default_shipping boolean NOT NULL DEFAULT false,
  is_default_billing boolean NOT NULL DEFAULT false,

  -- Sort order for UI (0..n)
  sort_order integer NOT NULL DEFAULT 0,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,

  -- Lightweight sanity checks
  CONSTRAINT chk_country_iso2 CHECK (country ~ '^[A-Z]{2}$')
);

-- Indexes
CREATE INDEX idx_customer_addresses_customer
  ON customer_addresses (customer_id);

CREATE INDEX idx_customer_addresses_created_at
  ON customer_addresses (created_at);

-- Enforce only ONE default shipping address per customer (ignoring soft-deleted rows)
CREATE UNIQUE INDEX uniq_customer_addresses_default_shipping
  ON customer_addresses (customer_id)
  WHERE is_default_shipping = true AND deleted_at IS NULL;

-- Enforce only ONE default billing address per customer (ignoring soft-deleted rows)
CREATE UNIQUE INDEX uniq_customer_addresses_default_billing
  ON customer_addresses (customer_id)
  WHERE is_default_billing = true AND deleted_at IS NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER trg_customer_addresses_updated_at
BEFORE UPDATE ON customer_addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
