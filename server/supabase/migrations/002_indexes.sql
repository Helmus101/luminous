alter table public.profiles add column if not exists profile_json jsonb not null default '{}'::jsonb;

create index if not exists people_external_key_idx on public.people(external_key);
create index if not exists match_requests_requester_month_idx on public.match_requests(requester_email, created_at);
create index if not exists consent_emails_request_idx on public.consent_emails(request_id);
