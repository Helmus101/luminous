-- Supabase-ready schema for Luminous.
-- Run this in the Supabase SQL editor before setting DATA_BACKEND=supabase.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  linkedin_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  email text not null,
  source text not null,
  file_name text,
  summary text not null,
  specific_reason text,
  target_person text,
  industries jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  education_signals jsonb not null default '[]'::jsonb,
  interests jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  confidence text not null default 'light',
  missing_info jsonb not null default '[]'::jsonb,
  extraction_mode text not null default 'mock_fallback',
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  name text not null,
  background text not null,
  current_role_text text not null,
  expertise jsonb not null default '[]'::jsonb,
  interests jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  relationship_preferences jsonb not null default '[]'::jsonb,
  location text,
  industries jsonb not null default '[]'::jsonb,
  willing_to_connect boolean not null default true,
  contact_email text not null,
  linkedin_url text,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.match_requests (
  id uuid primary key default gen_random_uuid(),
  requester_email text not null,
  requester_user_id uuid references public.users(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  linkedin_url text,
  status text not null default 'consent_pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.match_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.match_requests(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  rank integer not null,
  score integer not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  shared_signals jsonb not null default '[]'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.consent_emails (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.match_requests(id) on delete cascade,
  candidate_id uuid references public.match_candidates(id) on delete cascade,
  recipient_email text not null,
  recipient_type text not null check (recipient_type in ('requester', 'candidate')),
  subject text not null,
  body text not null,
  mailto_url text,
  status text not null default 'drafted',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.match_requests(id) on delete cascade,
  candidate_id uuid references public.match_candidates(id) on delete cascade,
  status text not null default 'connected',
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  query text,
  source text default 'landing_page',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists profile_json jsonb not null default '{}'::jsonb;

create index if not exists people_external_key_idx on public.people(external_key);
create index if not exists match_requests_requester_month_idx on public.match_requests(requester_email, created_at);
create index if not exists consent_emails_request_idx on public.consent_emails(request_id);
create index if not exists waitlist_email_idx on public.waitlist(email);
create index if not exists waitlist_created_at_idx on public.waitlist(created_at desc);

alter table public.users add column if not exists auth_user_id uuid unique;
alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists full_name text;

create index if not exists users_auth_user_id_idx on public.users(auth_user_id);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  auth_user_id uuid,
  email text not null,
  initial_query text,
  title text not null default 'Luminous chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  auth_user_id uuid,
  email text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  payload jsonb,
  message_index integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.match_requests add column if not exists selected_candidate_id uuid references public.match_candidates(id) on delete set null;
alter table public.match_requests add column if not exists user_selected_at timestamptz;
alter table public.consent_emails add column if not exists email_stage text not null default 'candidate_consent';

create index if not exists chat_sessions_email_updated_idx on public.chat_sessions(email, updated_at desc);
create index if not exists chat_sessions_auth_user_updated_idx on public.chat_sessions(auth_user_id, updated_at desc);
create index if not exists chat_messages_session_index_idx on public.chat_messages(session_id, message_index);
create index if not exists match_requests_selected_candidate_idx on public.match_requests(selected_candidate_id);
create index if not exists consent_emails_stage_idx on public.consent_emails(email_stage);