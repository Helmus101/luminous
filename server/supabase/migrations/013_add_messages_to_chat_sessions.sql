alter table public.chat_sessions add column if not exists messages jsonb not null default '[]'::jsonb;
alter table public.chat_sessions drop constraint if exists chat_sessions_email_key;
alter table public.chat_sessions add constraint chat_sessions_email_key unique (email);
