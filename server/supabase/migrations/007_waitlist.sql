create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  initial_query text,
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

create index if not exists waitlist_email_created_idx on public.waitlist(email, created_at desc);
