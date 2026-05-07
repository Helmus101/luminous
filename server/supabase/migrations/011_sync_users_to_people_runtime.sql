-- Keeps every Luminous user represented as a matchable person.
-- This is intentionally profile_json-heavy so the app can evolve without
-- adding columns for every campus-experience signal.

insert into public.people (
  external_key,
  name,
  background,
  current_role_text,
  location,
  linkedin_url,
  contact_email,
  willing_to_connect,
  expertise,
  interests,
  goals,
  industries,
  profile_json
)
select
  u.id::text as external_key,
  coalesce(u.full_name, u.first_name, split_part(u.email, '@', 1)) as name,
  coalesce(p.summary, 'Luminous member building a student or mentor profile') as background,
  coalesce(
    p.profile_json->>'currentRole',
    p.profile_json->>'studentType',
    'Luminous member'
  ) as current_role_text,
  coalesce(
    p.profile_json->>'university',
    case when p.locations is not null and jsonb_array_length(p.locations) > 0 then p.locations->>0 else null end
  ) as location,
  u.linkedin_url,
  u.email as contact_email,
  true as willing_to_connect,
  coalesce(p.skills, '[]'::jsonb) as expertise,
  coalesce(p.interests, '[]'::jsonb) as interests,
  coalesce(p.goals, '[]'::jsonb) as goals,
  coalesce(p.industries, '[]'::jsonb) as industries,
  jsonb_build_object(
    'source', 'supabase_migration',
    'userId', u.id,
    'email', u.email,
    'latestProfile', coalesce(p.profile_json, '{}'::jsonb),
    'syncedAt', now()
  ) as profile_json
from public.users u
left join lateral (
  select *
  from public.profiles p
  where p.user_id = u.id or p.email = u.email
  order by p.created_at desc
  limit 1
) p on true
on conflict (external_key) do update set
  name = excluded.name,
  background = excluded.background,
  current_role_text = excluded.current_role_text,
  location = excluded.location,
  linkedin_url = excluded.linkedin_url,
  contact_email = excluded.contact_email,
  willing_to_connect = excluded.willing_to_connect,
  expertise = excluded.expertise,
  interests = excluded.interests,
  goals = excluded.goals,
  industries = excluded.industries,
  profile_json = public.people.profile_json || excluded.profile_json;

create or replace function public.sync_user_to_people()
returns trigger as $$
begin
  insert into public.people (
    external_key,
    name,
    background,
    current_role_text,
    contact_email,
    linkedin_url,
    willing_to_connect,
    profile_json
  )
  values (
    new.id::text,
    coalesce(new.full_name, new.first_name, split_part(new.email, '@', 1)),
    'Luminous member building a student or mentor profile',
    'Luminous member',
    new.email,
    new.linkedin_url,
    true,
    jsonb_build_object('source', 'user_trigger', 'userId', new.id, 'email', new.email, 'syncedAt', now())
  )
  on conflict (external_key) do update set
    name = excluded.name,
    contact_email = excluded.contact_email,
    linkedin_url = excluded.linkedin_url,
    profile_json = public.people.profile_json || excluded.profile_json;

  return new;
end;
$$ language plpgsql;

drop trigger if exists sync_user_to_people_trigger on public.users;
create trigger sync_user_to_people_trigger
  after insert or update on public.users
  for each row execute procedure public.sync_user_to_people();

