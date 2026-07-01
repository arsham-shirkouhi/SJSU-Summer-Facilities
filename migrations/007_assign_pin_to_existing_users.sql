-- Assign 4-digit login codes to EXISTING staff (created before pin login).
-- Run in Supabase SQL Editor AFTER 006_pin_code_login.sql.

drop function if exists public.assign_user_pin_code(uuid, text);
drop function if exists public.admin_assign_pin_code(uuid, text);

-- Use this from SQL Editor to backfill existing users (postgres role only).
create or replace function public.assign_user_pin_code(
  p_user_id uuid,
  p_pin_code text
)
returns table (
  user_id uuid,
  pin_code text,
  full_name text,
  login_email text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pin text := lpad(regexp_replace(trim(coalesce(p_pin_code, '')), '\D', '', 'g'), 4, '0');
  v_email text;
  v_password text;
  v_name text;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if v_pin !~ '^\d{4}$' then
    raise exception 'Login code must be exactly 4 digits';
  end if;

  select p.full_name
  into v_name
  from public.profiles p
  where p.id = p_user_id;

  if v_name is null then
    raise exception 'User profile not found';
  end if;

  if exists (
    select 1 from public.profiles p where p.pin_code = v_pin and p.id <> p_user_id
  ) then
    raise exception 'That login code is already in use';
  end if;

  v_email := 'staff-' || v_pin || '@linentrack.internal';
  v_password := 'Linen' || v_pin || '!';

  if exists (
    select 1 from auth.users u where lower(u.email) = v_email and u.id <> p_user_id
  ) then
    raise exception 'That login code is already in use';
  end if;

  update public.profiles set pin_code = v_pin where id = p_user_id;

  update auth.users
  set
    email = v_email,
    encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('pin_code', v_pin),
    updated_at = now()
  where id = p_user_id;

  update auth.identities
  set
    provider_id = v_email,
    identity_data = jsonb_build_object('sub', p_user_id::text, 'email', v_email),
    updated_at = now()
  where user_id = p_user_id and provider = 'email';

  return query select p_user_id, v_pin, v_name, v_email;
end;
$$;

revoke all on function public.assign_user_pin_code(uuid, text) from public;

notify pgrst, 'reload schema';

-- ============================================================
-- HOW TO USE
-- ============================================================
--
-- STEP 1 — See who needs a code:
--
--   select p.id, p.full_name, p.role, p.pin_code, u.email
--   from public.profiles p
--   join auth.users u on u.id = p.id
--   order by p.full_name;
--
-- STEP 2 — Assign a unique 4-digit code to each person:
--
--   select * from public.assign_user_pin_code(
--     'PASTE-USER-UUID-HERE'::uuid,
--     '1234'
--   );
--
-- STEP 3 — Repeat for every staff member (each code must be unique).
--          They log in with just that 4-digit code on the app.
--
-- ALTERNATIVE — Skip backfill and use Admin → Staff Management:
--   delete old accounts and create new ones with name + 4-digit code.

