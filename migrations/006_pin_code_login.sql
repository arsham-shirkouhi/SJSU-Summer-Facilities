-- Switch staff login to unique 4-digit codes.
-- Run in Supabase SQL Editor on your LIVE project.

alter table public.profiles
  add column if not exists pin_code text;

create unique index if not exists profiles_pin_code_key on public.profiles (pin_code)
  where pin_code is not null;

alter table public.profiles
  drop constraint if exists profiles_pin_code_format;

alter table public.profiles
  add constraint profiles_pin_code_format
  check (pin_code is null or pin_code ~ '^\d{4}$');

drop function if exists public.admin_list_members();
drop function if exists public.admin_create_user_account(text, text, text, text);
drop function if exists public.admin_create_user_account(text, text, text);
drop function if exists public.admin_delete_user_account(text);

create or replace function public.admin_list_members()
returns table (
  user_id uuid,
  pin_code text,
  full_name text,
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
  p_role text default 'staff'
)
returns table (
  user_id uuid,
  pin_code text,
  full_name text,
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
  v_email text;
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

  if v_role not in ('admin', 'staff') then
    raise exception 'Role must be admin or staff';
  end if;

  if exists (select 1 from public.profiles p where p.pin_code = v_pin) then
    raise exception 'That login code is already in use';
  end if;

  v_email := 'staff-' || v_pin || '@linentrack.internal';
  v_password := 'Linen' || v_pin || '!';

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'A user with this login code already exists';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', v_name, 'role', v_role, 'pin_code', v_pin),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_user_id,
    v_email,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    now(),
    now(),
    now()
  );

  insert into public.user_access_roles (user_id, role)
  values (v_user_id, v_role)
  on conflict on constraint user_access_roles_pkey do update set role = excluded.role;

  insert into public.profiles (id, full_name, role, pin_code)
  values (v_user_id, v_name, v_role, v_pin)
  on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role, pin_code = excluded.pin_code;

  return query
  select
    v_user_id as user_id,
    v_pin as pin_code,
    v_name as full_name,
    v_role as role,
    true as is_active,
    now() as created_at;
end;
$$;

create or replace function public.admin_delete_user_account(p_pin_code text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pin text := lpad(regexp_replace(trim(coalesce(p_pin_code, '')), '\D', '', 'g'), 4, '0');
  v_user_id uuid;
  v_admin_count integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can delete users';
  end if;

  if v_pin !~ '^\d{4}$' then
    raise exception 'Login code is required';
  end if;

  select p.id
  into v_user_id
  from public.profiles p
  where p.pin_code = v_pin;

  if v_user_id is null then
    raise exception 'User not found';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  select count(*)
  into v_admin_count
  from public.user_access_roles
  where role = 'admin';

  if v_admin_count <= 1 and exists (
    select 1
    from public.user_access_roles
    where user_id = v_user_id and role = 'admin'
  ) then
    raise exception 'Cannot delete the last admin account';
  end if;

  update public.log_entries set staff_id = null where staff_id = v_user_id;
  update public.tasks set created_by = null where created_by = v_user_id;
  update public.laundry_batches set created_by = null where created_by = v_user_id;
  update public.laundry_loads set created_by = null where created_by = v_user_id;
  update public.shift_notes set created_by = null where created_by = v_user_id;
  update public.pickup_schedule set created_by = null where created_by = v_user_id;
  update public.announcements set created_by = null where created_by = v_user_id;

  delete from public.user_access_roles where user_id = v_user_id;
  delete from public.profiles where id = v_user_id;
  delete from auth.identities where user_id = v_user_id;
  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

revoke all on function public.admin_create_user_account(text, text, text) from public;
grant execute on function public.admin_create_user_account(text, text, text) to authenticated;

revoke all on function public.admin_delete_user_account(text) from public;
grant execute on function public.admin_delete_user_account(text) to authenticated;

notify pgrst, 'reload schema';
