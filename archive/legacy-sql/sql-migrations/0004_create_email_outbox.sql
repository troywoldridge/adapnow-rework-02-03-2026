-- 0004_create_email_outbox.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider text NOT NULL DEFAULT 'resend',
  message_type text NOT NULL, -- e.g. order_confirmation | quote_received | custom_order_received
  to_email text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL,

  resend_id text,
  status text NOT NULL DEFAULT 'queued', -- queued | sent | failed
  error text,

  related_table text, -- optional: quote_requests, custom_order_requests, orders
  related_id text,    -- optional: id from related table

  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz
);

CREATE INDEX IF NOT EXISTS email_outbox_created_at_idx ON email_outbox (created_at DESC);
CREATE INDEX IF NOT EXISTS email_outbox_to_email_idx ON email_outbox (to_email);
CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox (status);
