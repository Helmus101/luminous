alter table public.users add column if not exists auth_user_id uuid unique;

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

create index if not exists chat_sessions_email_updated_idx on public.chat_sessions(email, updated_at desc);
create index if not exists chat_sessions_auth_user_updated_idx on public.chat_sessions(auth_user_id, updated_at desc);
create index if not exists chat_messages_session_index_idx on public.chat_messages(session_id, message_index);
