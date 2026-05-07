create table if not exists public.campus_contributions (
  id uuid primary key default gen_random_uuid(),
  campus_slug text not null,
  campus_name text not null,
  contributor_email text,
  raw_input text not null,
  status text not null default 'pending',
  category text not null default 'other',
  public_summary text,
  confidence numeric,
  rationale text,
  created_at timestamptz not null default now()
);

create index if not exists campus_contributions_campus_idx
  on public.campus_contributions(campus_slug, created_at desc);

create index if not exists campus_contributions_status_idx
  on public.campus_contributions(status, created_at desc);
