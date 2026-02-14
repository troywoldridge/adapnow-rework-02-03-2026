CREATE TABLE IF NOT EXISTS email_outbox (
  id            BIGSERIAL PRIMARY KEY,

  provider      TEXT NOT NULL DEFAULT 'resend',
  message_type  TEXT NOT NULL,

  to_email      TEXT NOT NULL,
  from_email    TEXT NOT NULL,
  subject       TEXT NOT NULL,

  resend_id     TEXT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','sent','failed')),
  error         TEXT NULL,

  related_table TEXT NULL,
  related_id    TEXT NULL,

  sent_at       TIMESTAMPTZ NULL,
  failed_at     TIMESTAMPTZ NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox (status);
CREATE INDEX IF NOT EXISTS idx_email_outbox_message_type ON email_outbox (message_type);
CREATE INDEX IF NOT EXISTS idx_email_outbox_related ON email_outbox (related_table, related_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created_at ON email_outbox (created_at DESC);
