-- Store real contact emails on profiles (separate from internal login auth email).
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists contact_email text;

create unique index if not exists profiles_contact_email_key
  on public.profiles (lower(contact_email))
  where contact_email is not null;

drop function if exists public.admin_list_members();
drop function if exists public.admin_create_user_account(text, text, text);
drop function if exists public.assign_user_pin_code(uuid, text);

create or replace function public.admin_list_members()
returns table (
  user_id uuid,
  pin_code text,
  full_name text,
  contact_email text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id as user_id,
    p.pin_code,
    p.full_name,
    p.contact_email,
    coalesce(uar.role, p.role, 'staff') as role,
    coalesce(p.is_active, true) as is_active,
    coalesce(p.created_at, u.created_at) as created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_access_roles uar on uar.user_id = u.id
  where public.is_admin(auth.uid())
  order by coalesce(p.created_at, u.created_at) desc;
$$;

create or replace function public.admin_create_user_account(
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
  v_user_id uuid := gen_random_uuid();
  v_pin text := lpad(regexp_replace(trim(coalesce(p_pin_code, '')), '\D', '', 'g'), 4, '0');
  v_contact_email text := lower(trim(coalesce(p_contact_email, '')));
  v_auth_email text;
  v_password text;
  v_role text := lower(trim(coalesce(p_role, 'staff')));
  v_name text := coalesce(nullif(trim(p_full_name), ''), 'Staff User');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can create users';
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

  if exists (select 1 from public.profiles p where p.pin_code = v_pin) then
    raise exception 'That login code is already in use';
  end if;

  if exists (select 1 from public.profiles p where lower(p.contact_email) = v_contact_email) then
    raise exception 'That contact email is already in use';
  end if;

  v_auth_email := 'staff-' || v_pin || '@linentrack.internal';
  v_password := 'Linen' || v_pin || '!';

  if exists (select 1 from auth.users u where lower(u.email) = v_auth_email) then
    raise exception 'A user with this login code already exists';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_auth_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', v_name, 'role', v_role, 'pin_code', v_pin, 'contact_email', v_contact_email),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_user_id, v_auth_email,
    jsonb_build_object('sub', v_user_id::text, 'email', v_auth_email),
    'email', now(), now(), now()
  );

  insert into public.user_access_roles (user_id, role)
  values (v_user_id, v_role)
  on conflict on constraint user_access_roles_pkey do update set role = excluded.role;

  insert into public.profiles (id, full_name, role, pin_code, contact_email)
  values (v_user_id, v_name, v_role, v_pin, v_contact_email)
  on conflict (id) do update
  set full_name = excluded.full_name,
      role = excluded.role,
      pin_code = excluded.pin_code,
      contact_email = excluded.contact_email;

  return query
  select v_user_id, v_pin, v_name, v_contact_email, v_role, true, now();
end;
$$;

create or replace function public.assign_user_pin_code(
  p_user_id uuid,
  p_pin_code text,
  p_contact_email text default null
)
returns table (
  user_id uuid,
  pin_code text,
  full_name text,
  contact_email text,
  login_email text
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
  v_name text;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if v_pin !~ '^\d{4}$' then
    raise exception 'Login code must be exactly 4 digits';
  end if;

  select p.full_name, p.contact_email
  into v_name, v_contact_email
  from public.profiles p
  where p.id = p_user_id;

  if v_name is null then
    raise exception 'User profile not found';
  end if;

  if p_contact_email is not null and trim(p_contact_email) <> '' then
    v_contact_email := lower(trim(p_contact_email));
  end if;

  if v_contact_email is not null and v_contact_email <> '' then
    if v_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Contact email is invalid';
    end if;
    if exists (
      select 1 from public.profiles p
      where lower(p.contact_email) = v_contact_email and p.id <> p_user_id
    ) then
      raise exception 'That contact email is already in use';
    end if;
  end if;

  if exists (
    select 1 from public.profiles p where p.pin_code = v_pin and p.id <> p_user_id
  ) then
    raise exception 'That login code is already in use';
  end if;

  v_auth_email := 'staff-' || v_pin || '@linentrack.internal';
  v_password := 'Linen' || v_pin || '!';

  if exists (
    select 1 from auth.users u where lower(u.email) = v_auth_email and u.id <> p_user_id
  ) then
    raise exception 'That login code is already in use';
  end if;

  update public.profiles
  set
    pin_code = v_pin,
    contact_email = case
      when v_contact_email is not null and v_contact_email <> '' then v_contact_email
      else contact_email
    end
  where id = p_user_id;

  select p.contact_email into v_contact_email from public.profiles p where p.id = p_user_id;

  update auth.users
  set
    email = v_auth_email,
    encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('pin_code', v_pin, 'contact_email', v_contact_email),
    updated_at = now()
  where id = p_user_id;

  update auth.identities
  set
    provider_id = v_auth_email,
    identity_data = jsonb_build_object('sub', p_user_id::text, 'email', v_auth_email),
    updated_at = now()
  where user_id = p_user_id and provider = 'email';

  return query select p_user_id, v_pin, v_name, v_contact_email, v_auth_email;
end;
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

revoke all on function public.admin_create_user_account(text, text, text, text) from public;
grant execute on function public.admin_create_user_account(text, text, text, text) to authenticated;

revoke all on function public.assign_user_pin_code(uuid, text, text) from public;

notify pgrst, 'reload schema';
