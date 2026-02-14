-- Track outgoing emails so cron/jobs are idempotent.
-- Prevents spamming customers on every scan.

CREATE TABLE IF NOT EXISTS email_deliveries (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,                 -- e.g. 'artwork_needed'
  order_id text NOT NULL,             -- store as text to be flexible
  to_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'resend',
  provider_id text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_kind_order_unique
  ON email_deliveries(kind, order_id);
