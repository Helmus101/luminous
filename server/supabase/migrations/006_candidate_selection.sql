alter table public.match_requests add column if not exists selected_candidate_id uuid references public.match_candidates(id) on delete set null;
alter table public.match_requests add column if not exists user_selected_at timestamptz;

alter table public.consent_emails add column if not exists email_stage text not null default 'candidate_consent';

create index if not exists match_requests_selected_candidate_idx on public.match_requests(selected_candidate_id);
create index if not exists consent_emails_stage_idx on public.consent_emails(email_stage);
