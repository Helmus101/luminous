create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  student_type text,
  source text not null default 'waitlist',
  created_at timestamptz not null default now()
);

alter table public.waitlist add column if not exists student_type text;
alter table public.waitlist add column if not exists source text not null default 'waitlist';

create index if not exists waitlist_email_idx on public.waitlist(email);
create index if not exists waitlist_student_type_idx on public.waitlist(student_type);

