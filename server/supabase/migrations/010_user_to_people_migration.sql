-- Force insert all existing users into people table with full context
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
  coalesce(p.summary, 'Member of the Luminous community') as background,
  coalesce(p.summary, 'Member') as current_role_text,
  case 
    when p.locations is not null and jsonb_array_length(p.locations) > 0 then (p.locations->>0)
    else null
  end as location,
  u.linkedin_url,
  u.email as contact_email,
  true as willing_to_connect,
  coalesce(p.skills, '[]'::jsonb) as expertise,
  coalesce(p.interests, '[]'::jsonb) as interests,
  coalesce(p.goals, '[]'::jsonb) as goals,
  coalesce(p.industries, '[]'::jsonb) as industries,
  coalesce(p.profile_json, '{}'::jsonb) as profile_json
from public.users u
left join public.profiles p on u.id = p.user_id
on conflict (external_key) do update set
  name = excluded.name,
  background = excluded.background,
  current_role_text = excluded.current_role_text,
  location = excluded.location,
  linkedin_url = excluded.linkedin_url,
  expertise = excluded.expertise,
  interests = excluded.interests,
  goals = excluded.goals,
  industries = excluded.industries,
  profile_json = excluded.profile_json;

-- Add a column to profiles to track if they have been 'synced' to people
alter table public.profiles add column if not exists synced_to_people boolean default false;

-- Function to sync profile changes to people table
create or replace function public.sync_profile_to_people()
returns trigger as $$
begin
  insert into public.people (
    external_key,
    name,
    background,
    current_role_text,
    location,
    expertise,
    interests,
    goals,
    industries,
    profile_json,
    contact_email
  )
  select 
    u.id::text,
    coalesce(u.full_name, u.first_name, split_part(u.email, '@', 1)),
    new.summary,
    new.summary,
    case when new.locations is not null and jsonb_array_length(new.locations) > 0 then (new.locations->>0) else null end,
    new.skills,
    new.interests,
    new.goals,
    new.industries,
    new.profile_json,
    u.email
  from public.users u
  where u.id = new.user_id
  on conflict (external_key) do update set
    background = excluded.background,
    current_role_text = excluded.current_role_text,
    location = excluded.location,
    expertise = excluded.expertise,
    interests = excluded.interests,
    goals = excluded.goals,
    industries = excluded.industries,
    profile_json = excluded.profile_json;
    
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_profile_changed_sync on public.profiles;
create trigger on_profile_changed_sync
  after insert or update on public.profiles
  for each row execute procedure public.sync_profile_to_people();
