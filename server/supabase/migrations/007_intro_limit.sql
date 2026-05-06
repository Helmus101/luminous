-- Create a table for intros (actual accepted connections) if not already inferred
-- Based on the requirement "3 intros limit" instead of "3 searches"

create table if not exists public.intros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  request_id uuid references public.match_requests(id) on delete cascade,
  candidate_id uuid references public.match_candidates(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- We can also use a status on connections or match_requests, 
-- but a dedicated table or a specific flag on connections is cleaner.
