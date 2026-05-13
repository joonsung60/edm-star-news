create table if not exists public.topic_suggestion_blocklist (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  reason text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists topic_suggestion_blocklist_enabled_created_at_idx
  on public.topic_suggestion_blocklist (enabled, created_at desc);

create unique index if not exists topic_suggestion_blocklist_pattern_lower_idx
  on public.topic_suggestion_blocklist (lower(pattern));
