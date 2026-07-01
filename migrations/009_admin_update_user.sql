-- Allow admins to edit staff member details.
-- Run in Supabase SQL Editor.

drop function if exists public.admin_update_user_account(uuid, text, text, text, text);

create or replace function public.admin_update_user_account(
  p_user_id uuid,
  p_full_name text,
  p_pin_code text,
  p_contact_email text,
  p_role text default 'staff'
)
returns table (
  user_id uuid,
  pin_code text,
  full_name text,
  contact_email text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pin text := lpad(regexp_replace(trim(coalesce(p_pin_code, '')), '\D', '', 'g'), 4, '0');
  v_contact_email text := lower(trim(coalesce(p_contact_email, '')));
  v_auth_email text;
  v_password text;
  v_role text := lower(trim(coalesce(p_role, 'staff')));
  v_name text := coalesce(nullif(trim(p_full_name), ''), 'Staff User');
  v_old_pin text;
  v_admin_count integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can update users';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'User not found';
  end if;

  if v_pin !~ '^\d{4}$' then
    raise exception 'Login code must be exactly 4 digits';
  end if;

  if v_contact_email is null or v_contact_email = '' then
    raise exception 'Contact email is required';
  end if;

  if v_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Contact email is invalid';
  end if;

  if v_role not in ('admin', 'staff') then
    raise exception 'Role must be admin or staff';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.pin_code = v_pin and p.id <> p_user_id
  ) then
    raise exception 'That login code is already in use';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(p.contact_email) = v_contact_email and p.id <> p_user_id
  ) then
    raise exception 'That contact email is already in use';
  end if;

  select p.pin_code into v_old_pin from public.profiles p where p.id = p_user_id;

  if v_role <> 'admin' and exists (
    select 1 from public.user_access_roles uar
    where uar.user_id = p_user_id and uar.role = 'admin'
  ) then
    select count(*) into v_admin_count
    from public.user_access_roles uar2
    where uar2.role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last admin account';
    end if;
  end if;

  v_auth_email := 'staff-' || v_pin || '@linentrack.internal';
  v_password := 'Linen' || v_pin || '!';

  if exists (
    select 1 from auth.users u
    where lower(u.email) = v_auth_email and u.id <> p_user_id
  ) then
    raise exception 'That login code is already in use';
  end if;

  update public.profiles
  set
    full_name = v_name,
    role = v_role,
    pin_code = v_pin,
    contact_email = v_contact_email
  where profiles.id = p_user_id;

  update public.user_access_roles uar
  set role = v_role
  where uar.user_id = p_user_id;

  insert into public.user_access_roles (user_id, role)
  values (p_user_id, v_role)
  on conflict on constraint user_access_roles_pkey do update set role = excluded.role;

  if v_old_pin is distinct from v_pin then
    update auth.users
    set
      email = v_auth_email,
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'full_name', v_name,
          'role', v_role,
          'pin_code', v_pin,
          'contact_email', v_contact_email
        ),
      updated_at = now()
    where auth.users.id = p_user_id;

    update auth.identities i
    set
      provider_id = v_auth_email,
      identity_data = jsonb_build_object('sub', p_user_id::text, 'email', v_auth_email),
      updated_at = now()
    where i.user_id = p_user_id and i.provider = 'email';
  else
    update auth.users
    set
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'full_name', v_name,
          'role', v_role,
          'pin_code', v_pin,
          'contact_email', v_contact_email
        ),
      updated_at = now()
    where auth.users.id = p_user_id;
  end if;

  return query
  select
    p.id as user_id,
    p.pin_code,
    p.full_name,
    p.contact_email,
    coalesce(uar.role, p.role, 'staff') as role,
    coalesce(p.is_active, true) as is_active,
    coalesce(p.created_at, now()) as created_at
  from public.profiles p
  left join public.user_access_roles uar on uar.user_id = p.id
  where p.id = p_user_id;
end;
$$;

revoke all on function public.admin_update_user_account(uuid, text, text, text, text) from public;
grant execute on function public.admin_update_user_account(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
