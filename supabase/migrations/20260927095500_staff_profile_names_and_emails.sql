alter table public.ops_profiles add column if not exists email text;

update public.ops_profiles p
set email = u.email,
    full_name = case
      when coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), nullif(trim(u.raw_user_meta_data->>'name'), '')) is not null
        then coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), nullif(trim(u.raw_user_meta_data->>'name'), ''))
      when p.full_name is distinct from u.email then p.full_name
      else null
    end,
    updated_at = now()
from auth.users u
where u.id = p.id;

create or replace function public.ops_ensure_profile()
returns public.ops_profiles
language plpgsql
security definer
set search_path = public
as $function$
declare r public.ops_profiles;
declare first_user boolean;
declare jwt_email text;
declare jwt_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  first_user := not exists (select 1 from public.ops_profiles where role='owner' and active=true);
  jwt_email := auth.jwt()->>'email';
  jwt_name := coalesce(
    nullif(trim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    nullif(trim(auth.jwt()->'user_metadata'->>'name'), ''),
    nullif(trim(auth.jwt()->>'name'), '')
  );

  insert into public.ops_profiles(id, full_name, email, role, active, access_requested_at)
  values (
    auth.uid(),
    jwt_name,
    jwt_email,
    case when first_user then 'owner' else 'pending' end,
    first_user,
    case when first_user then null else now() end
  )
  on conflict (id) do update
  set email = coalesce(excluded.email, ops_profiles.email),
      full_name = case
        when ops_profiles.full_name is null or trim(ops_profiles.full_name) = '' or ops_profiles.full_name = ops_profiles.email
          then coalesce(excluded.full_name, ops_profiles.full_name)
        else ops_profiles.full_name
      end,
      updated_at = now();

  update public.ops_profiles
  set role='pending',
      active=false,
      access_requested_at=now(),
      last_fired_at=coalesce(last_fired_at,deactivated_at),
      deactivated_at=null,
      deactivated_by=null,
      email=coalesce(jwt_email,email),
      updated_at=now()
  where id=auth.uid() and active=false and deactivated_at is not null;

  select * into r from public.ops_profiles where id=auth.uid();
  return r;
end;
$function$;

create or replace function public.ops_set_staff_name(p_user_id uuid, p_full_name text)
returns public.ops_profiles
language plpgsql
security definer
set search_path = public
as $function$
declare r public.ops_profiles;
begin
  if not exists (
    select 1 from public.ops_profiles
    where id = auth.uid() and active = true and role = 'owner'
  ) then
    raise exception 'Owner access required';
  end if;

  update public.ops_profiles
  set full_name = nullif(trim(p_full_name), ''), updated_at = now()
  where id = p_user_id
  returning * into r;

  if r.id is null then raise exception 'Staff member not found'; end if;
  return r;
end;
$function$;

grant execute on function public.ops_set_staff_name(uuid,text) to authenticated;
