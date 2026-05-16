alter table public.raw_articles
  add column if not exists suggestion_state text default 'new',
  add column if not exists suggestion_last_checked_at timestamptz,
  add column if not exists suggestion_rejected_at timestamptz,
  add column if not exists suggestion_used_at timestamptz,
  add column if not exists suggestion_note text;

create index if not exists raw_articles_suggestion_state_published_at_idx
  on public.raw_articles (suggestion_state, published_at desc);
