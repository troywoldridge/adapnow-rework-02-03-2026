-- 0003_create_guide_download_events.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS guide_download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  href text NOT NULL,
  label text NOT NULL,
  category_path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,

  user_agent text,
  ip text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_download_events_created_at_idx ON guide_download_events (created_at DESC);
CREATE INDEX IF NOT EXISTS guide_download_events_category_idx ON guide_download_events (category_path);
