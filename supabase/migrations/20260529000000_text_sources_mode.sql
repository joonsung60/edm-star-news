ALTER TABLE text_sources
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'article';
