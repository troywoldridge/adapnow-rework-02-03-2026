-- scripts/sql/0006_customers_futureproof_resume.sql
-- Idempotent "resume" migration for customers + customer_addresses.
-- Handles environments where customer_addresses.clerk_user_id may already be removed.
-- Run: psql "$DATABASE_URL" -f scripts/sql/0006_customers_futureproof_resume.sql

BEGIN;

-- 0) updated_at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Ensure customers future-proof columns exist
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS phone_enc text,
  ADD COLUMN IF NOT EXISTS phone_last4 text,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Customers indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_customers_created_at'
  ) THEN
    CREATE INDEX idx_customers_created_at ON customers (created_at);
  END IF;
END $$;

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

-- 2) Ensure customer_addresses future-proof columns exist
ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone_enc text,
  ADD COLUMN IF NOT EXISTS phone_last4 text,
  ADD COLUMN IF NOT EXISTS is_default_shipping boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3) If legacy is_default exists, map it to shipping default and drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_addresses' AND column_name='is_default'
  ) THEN
    EXECUTE 'UPDATE customer_addresses SET is_default_shipping = true WHERE is_default = true';
    EXECUTE 'ALTER TABLE customer_addresses DROP COLUMN IF EXISTS is_default';
  END IF;
END $$;

-- 4) Backfill customer_id if it's nullable and has NULLs AND if we still have clerk_user_id on addresses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_addresses' AND column_name='customer_id'
  ) AND EXISTS (
    SELECT 1 FROM customer_addresses WHERE customer_id IS NULL
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_addresses' AND column_name='clerk_user_id'
  ) THEN

    -- Create missing customers for any clerk_user_id seen in addresses
    EXECUTE $ins$
      INSERT INTO customers (clerk_user_id, created_at, updated_at)
      SELECT DISTINCT a.clerk_user_id, now(), now()
      FROM customer_addresses a
      LEFT JOIN customers c ON c.clerk_user_id = a.clerk_user_id
      WHERE c.id IS NULL
    $ins$;

    -- Backfill customer_id for those address rows
    EXECUTE $upd$
      UPDATE customer_addresses a
      SET customer_id = c.id
      FROM customers c
      WHERE a.customer_id IS NULL
        AND a.clerk_user_id = c.clerk_user_id
    $upd$;

  END IF;
END $$;

-- 5) Drop old indexes that might still exist (safe)
DROP INDEX IF EXISTS uniq_customer_addresses_default_by_clerk;
DROP INDEX IF EXISTS idx_customer_addresses_clerk;

-- 6) Create new indexes if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_customer_addresses_customer'
  ) THEN
    CREATE INDEX idx_customer_addresses_customer ON customer_addresses (customer_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_customer_addresses_created_at'
  ) THEN
    CREATE INDEX idx_customer_addresses_created_at ON customer_addresses (created_at);
  END IF;
END $$;

-- 7) Enforce only one default shipping/billing per customer (partial unique)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='uniq_customer_addresses_default_shipping'
  ) THEN
    CREATE UNIQUE INDEX uniq_customer_addresses_default_shipping
      ON customer_addresses (customer_id)
      WHERE is_default_shipping = true AND deleted_at IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='uniq_customer_addresses_default_billing'
  ) THEN
    CREATE UNIQUE INDEX uniq_customer_addresses_default_billing
      ON customer_addresses (customer_id)
      WHERE is_default_billing = true AND deleted_at IS NULL;
  END IF;
END $$;

-- 8) If clerk_user_id column still exists on customer_addresses, drop it (it is redundant)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_addresses' AND column_name='clerk_user_id'
  ) THEN
    EXECUTE 'ALTER TABLE customer_addresses DROP COLUMN IF EXISTS clerk_user_id';
  END IF;
END $$;

-- 9) Set customer_id NOT NULL only if it's fully populated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer_addresses' AND column_name='customer_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id IS NULL) THEN
      RAISE NOTICE 'Skipping ALTER customer_addresses.customer_id SET NOT NULL because NULL rows still exist.';
    ELSE
      EXECUTE 'ALTER TABLE customer_addresses ALTER COLUMN customer_id SET NOT NULL';
    END IF;
  END IF;
END $$;

-- 10) updated_at trigger for customer_addresses
DROP TRIGGER IF EXISTS trg_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER trg_customer_addresses_updated_at
BEFORE UPDATE ON customer_addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
