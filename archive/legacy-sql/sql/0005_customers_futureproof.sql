-- scripts/sql/0004_customers_futureproof.sql
-- Future-proof upgrade for customers + customer_addresses (preserves existing data)
-- Run: psql "$DATABASE_URL" -f scripts/sql/0004_customers_futureproof.sql

BEGIN;

-- 0) updated_at trigger helper (safe if already exists)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) CUSTOMERS: add future-proof columns (all nullable or defaulted)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS phone_enc text,
  ADD COLUMN IF NOT EXISTS phone_last4 text,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Indexes (safe: IF NOT EXISTS not supported for all index cases, so we guard with DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_customers_created_at'
  ) THEN
    CREATE INDEX idx_customers_created_at ON customers (created_at);
  END IF;
END $$;

-- Partial unique: email unique when present and not soft-deleted
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_customers_email_not_null'
  ) THEN
    CREATE UNIQUE INDEX uniq_customers_email_not_null
      ON customers (email)
      WHERE email IS NOT NULL AND deleted_at IS NULL;
  END IF;
END $$;

-- updated_at trigger for customers
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2) CUSTOMER_ADDRESSES: add future-proof columns
ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone_enc text,
  ADD COLUMN IF NOT EXISTS phone_last4 text,
  ADD COLUMN IF NOT EXISTS is_default_shipping boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3) Backfill: ensure every clerk_user_id in addresses has a customers row
-- (Needed to safely backfill customer_id and then drop addresses.clerk_user_id)
INSERT INTO customers (clerk_user_id, created_at, updated_at)
SELECT DISTINCT a.clerk_user_id, now(), now()
FROM customer_addresses a
LEFT JOIN customers c ON c.clerk_user_id = a.clerk_user_id
WHERE c.id IS NULL;

-- 4) Backfill: set customer_addresses.customer_id from customers by clerk_user_id
UPDATE customer_addresses a
SET customer_id = c.id
FROM customers c
WHERE a.customer_id IS NULL
  AND a.clerk_user_id = c.clerk_user_id;

-- 5) Convert old is_default -> default shipping
-- If you previously used is_default as "default address", we map it to default shipping.
UPDATE customer_addresses
SET is_default_shipping = true
WHERE is_default = true;

-- 6) Safety check: refuse to continue if any address still has NULL customer_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id IS NULL) THEN
    RAISE EXCEPTION 'Migration aborted: customer_addresses has rows with NULL customer_id after backfill.';
  END IF;
END $$;

-- 7) Drop old indexes tied to clerk_user_id default logic
DROP INDEX IF EXISTS uniq_customer_addresses_default_by_clerk;
DROP INDEX IF EXISTS idx_customer_addresses_clerk;

-- 8) Create new indexes on customer_id and new default constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_customer_addresses_customer'
  ) THEN
    CREATE INDEX idx_customer_addresses_customer ON customer_addresses (customer_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_customer_addresses_created_at'
  ) THEN
    CREATE INDEX idx_customer_addresses_created_at ON customer_addresses (created_at);
  END IF;
END $$;

-- One default shipping per customer (ignoring soft-deleted rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_customer_addresses_default_shipping'
  ) THEN
    CREATE UNIQUE INDEX uniq_customer_addresses_default_shipping
      ON customer_addresses (customer_id)
      WHERE is_default_shipping = true AND deleted_at IS NULL;
  END IF;
END $$;

-- One default billing per customer (ignoring soft-deleted rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_customer_addresses_default_billing'
  ) THEN
    CREATE UNIQUE INDEX uniq_customer_addresses_default_billing
      ON customer_addresses (customer_id)
      WHERE is_default_billing = true AND deleted_at IS NULL;
  END IF;
END $$;

-- 9) Remove legacy columns from customer_addresses
-- Make customer_id NOT NULL before dropping clerk_user_id
ALTER TABLE customer_addresses
  ALTER COLUMN customer_id SET NOT NULL;

-- Drop old is_default (we replaced it)
ALTER TABLE customer_addresses
  DROP COLUMN IF EXISTS is_default;

-- Drop redundant clerk_user_id column (future-proofing)
ALTER TABLE customer_addresses
  DROP COLUMN IF EXISTS clerk_user_id;

-- 10) updated_at trigger for customer_addresses
DROP TRIGGER IF EXISTS trg_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER trg_customer_addresses_updated_at
BEFORE UPDATE ON customer_addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
