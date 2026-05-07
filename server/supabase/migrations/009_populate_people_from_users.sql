-- 1. Ensure all existing users are represented in the people table if they aren't already
insert into public.people (
  external_key,
  name,
  background,
  current_role_text,
  location,
  linkedin_url,
  contact_email,
  willing_to_connect,
  profile_json
)
select 
  u.id::text as external_key,
  coalesce(u.full_name, u.first_name, split_part(u.email, '@', 1)) as name,
  coalesce(p.summary, 'Member of the Luminous community') as background,
  coalesce(p.summary, 'User') as current_role_text,
  case 
    when p.locations is not null and jsonb_array_length(p.locations) > 0 then (p.locations->>0)
    else null
  end as location,
  u.linkedin_url,
  u.email as contact_email,
  true as willing_to_connect,
  coalesce(p.profile_json, '{}'::jsonb) as profile_json
from public.users u
left join public.profiles p on u.id = p.user_id
on conflict (external_key) do update set
  name = excluded.name,
  background = excluded.background,
  current_role_text = excluded.current_role_text,
  location = excluded.location,
  linkedin_url = excluded.linkedin_url,
  profile_json = excluded.profile_json;

-- 2. Add a trigger to automatically add new users to the people table
create or replace function public.handle_new_user_people()
returns trigger as $$
begin
  insert into public.people (external_key, name, background, current_role_text, contact_email, linkedin_url)
  values (
    new.id::text,
    coalesce(new.full_name, new.first_name, split_part(new.email, '@', 1)),
    'New member of Luminous',
    'User',
    new.email,
    new.linkedin_url
  )
  on conflict (external_key) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_user_created_people on public.users;
create trigger on_user_created_people
  after insert on public.users
  for each row execute procedure public.handle_new_user_people();
