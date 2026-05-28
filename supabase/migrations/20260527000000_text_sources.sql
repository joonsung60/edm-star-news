CREATE TABLE IF NOT EXISTS text_sources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text              text NOT NULL,
  source_memo           text,
  source_url            text,
  source_date           date,
  generated_article_id  uuid REFERENCES articles(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'pending',
  created_at            timestamptz DEFAULT now()
);