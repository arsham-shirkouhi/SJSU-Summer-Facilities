-- Allow admins to delete staff accounts from the app.
-- Run in Supabase SQL Editor.

drop function if exists public.admin_delete_user_account(text);

create or replace function public.admin_delete_user_account(p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_admin_count integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can delete users';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = v_email;

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

revoke all on function public.admin_delete_user_account(text) from public;
grant execute on function public.admin_delete_user_account(text) to authenticated;

notify pgrst, 'reload schema';
