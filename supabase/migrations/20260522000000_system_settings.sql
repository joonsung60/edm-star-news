CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);
