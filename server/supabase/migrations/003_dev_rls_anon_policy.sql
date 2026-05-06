-- Development-only policies for using SUPABASE_ANON_KEY from the local Express server.
-- For production, prefer SUPABASE_SERVICE_ROLE_KEY on the server and replace these
-- permissive policies with real authenticated user policies.

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.match_requests enable row level security;
alter table public.match_candidates enable row level security;
alter table public.consent_emails enable row level security;
alter table public.connections enable row level security;

drop policy if exists "dev anon all users" on public.users;
drop policy if exists "dev anon all profiles" on public.profiles;
drop policy if exists "dev anon all people" on public.people;
drop policy if exists "dev anon all match requests" on public.match_requests;
drop policy if exists "dev anon all match candidates" on public.match_candidates;
drop policy if exists "dev anon all consent emails" on public.consent_emails;
drop policy if exists "dev anon all connections" on public.connections;

create policy "dev anon all users" on public.users for all to anon using (true) with check (true);
create policy "dev anon all profiles" on public.profiles for all to anon using (true) with check (true);
create policy "dev anon all people" on public.people for all to anon using (true) with check (true);
create policy "dev anon all match requests" on public.match_requests for all to anon using (true) with check (true);
create policy "dev anon all match candidates" on public.match_candidates for all to anon using (true) with check (true);
create policy "dev anon all consent emails" on public.consent_emails for all to anon using (true) with check (true);
create policy "dev anon all connections" on public.connections for all to anon using (true) with check (true);
