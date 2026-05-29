-- WARNING: this script resets LinenTrack tables and seed data.
-- Run only when you want to overwrite previous project data.
create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.admin_list_members();
drop function if exists public.admin_create_user_account(text, text, text, text);

drop table if exists laundry_batch_items cascade;
drop table if exists laundry_batches cascade;
drop table if exists laundry_loads cascade;
drop table if exists laundry_cycle_reports cascade;
drop table if exists log_entries cascade;
drop table if exists balances cascade;
drop table if exists shelf_items cascade;
drop table if exists shelves cascade;
drop table if exists location_linen_totals cascade;
drop table if exists tasks cascade;
drop table if exists shift_notes cascade;
drop table if exists pickup_schedule cascade;
drop table if exists announcements cascade;
drop table if exists items cascade;
drop table if exists locations cascade;
drop table if exists user_access_roles cascade;
drop table if exists profiles cascade;

-- profiles
create table profiles (
  id uuid references auth.users primary key,
  full_name text not null,
  role text not null default 'staff',
  location_access uuid[],
  is_active boolean default true,
  created_at timestamptz default now()
);

-- source-of-truth roles by auth user id
create table user_access_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz default now()
);

-- ============================================================
-- INVENTORY MODEL
-- locations    -> storage rooms (Mailroom, P1 Storage, etc.)
-- shelves      -> racks inside a room (add more over time)
-- shelf_items  -> which linen items belong on each rack
-- balances     -> live bundle count per rack + item
-- location_linen_totals -> room-level rollup for dashboard views
-- ============================================================

-- locations (storage rooms)
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  mode text not null default 'full' check (mode in ('full', 'partial')),
  building text,
  is_active boolean not null default true,
  low_threshold integer default 15,
  critical_threshold integer default 5,
  created_at timestamptz default now()
);

-- items (linen types shared across all rooms/racks)
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- shelves / racks (belong to exactly one storage room)
create table shelves (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations on delete cascade,
  name text not null,
  qr_slug text unique,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique(location_id, name)
);

-- shelf_items (configure which items can be stored on each rack)
create table shelf_items (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references shelves on delete cascade,
  item_id uuid not null references items on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique(shelf_id, item_id)
);

-- location linen totals (quick count snapshot per room)
create table location_linen_totals (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references locations on delete cascade,
  linen integer not null default 0 check (linen >= 0),
  face_hand_towel integer not null default 0 check (face_hand_towel >= 0),
  body_towel integer not null default 0 check (body_towel >= 0),
  pillow_case integer not null default 0 check (pillow_case >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- balances (current bundle count for each rack + item pairing)
create table balances (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references shelves on delete cascade,
  location_id uuid not null references locations on delete cascade,
  item_id uuid not null references items on delete cascade,
  current_balance integer not null default 0 check (current_balance >= 0),
  updated_at timestamptz default now(),
  unique(shelf_id, item_id)
);

-- log entries
create table log_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations,
  shelf_id uuid references shelves,
  item_id uuid references items,
  action_type text not null,
  quantity integer not null,
  staff_id uuid references profiles,
  staff_name text,
  notes text,
  photo_url text,
  created_at timestamptz default now()
);

-- laundry batches
create table laundry_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  origin_location_id uuid references locations,
  destination_location_id uuid references locations,
  status text default 'collected',
  created_by uuid references profiles,
  creator_name text,
  stage_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- laundry batch items
create table laundry_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references laundry_batches on delete cascade,
  item_id uuid references items,
  quantity integer not null
);

-- active laundry loads
create table laundry_loads (
  id uuid primary key default gen_random_uuid(),
  machine_number integer not null,
  storage_room text not null,
  status text not null default 'washing',
  started_at timestamptz not null default now(),
  estimated_finish_at timestamptz not null,
  cycle_minutes integer not null default 75,
  completed_at timestamptz,
  created_by uuid references profiles,
  creator_name text,
  notes text
);

-- weekly laundry cycle report rows (derived from completed loads)
create table laundry_cycle_reports (
  id uuid primary key default gen_random_uuid(),
  load_id uuid,
  machine_number integer not null,
  storage_room text not null,
  cycle_minutes integer not null default 75,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  week_start date not null,
  created_at timestamptz default now()
);

-- tasks / daily log
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  subtasks jsonb not null default '[]'::jsonb,
  assigned_date date not null default current_date,
  status text default 'pending',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  is_priority boolean default false,
  created_by uuid references profiles,
  creator_name text,
  created_at timestamptz default now()
);

-- shift handoff notes
create table shift_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_by uuid references profiles,
  creator_name text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- pickup schedule
create table pickup_schedule (
  id uuid primary key default gen_random_uuid(),
  pickup_date date not null unique,
  notes text,
  created_by uuid references profiles,
  created_at timestamptz default now()
);

-- announcements
create table announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles,
  title text not null,
  body text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- indexes for fast lookups
create index if not exists idx_balances_location_id on balances(location_id);
create index if not exists idx_balances_shelf_id on balances(shelf_id);
create index if not exists idx_balances_item_id on balances(item_id);
create index if not exists idx_log_entries_staff_id on log_entries(staff_id);
create index if not exists idx_log_entries_location_id on log_entries(location_id);
create index if not exists idx_log_entries_created_at on log_entries(created_at desc);
create index if not exists idx_tasks_assigned_date on tasks(assigned_date);
create index if not exists idx_tasks_created_at on tasks(created_at);
create index if not exists idx_laundry_batches_status on laundry_batches(status);
create index if not exists idx_laundry_loads_status on laundry_loads(status);
create index if not exists idx_laundry_loads_started_at on laundry_loads(started_at);
create index if not exists idx_laundry_cycle_reports_week_start on laundry_cycle_reports(week_start);
create index if not exists idx_laundry_cycle_reports_completed_at on laundry_cycle_reports(completed_at desc);
create index if not exists idx_shelves_location_id on shelves(location_id);
create index if not exists idx_shelves_qr_slug on shelves(qr_slug);
create index if not exists idx_shelf_items_shelf_id on shelf_items(shelf_id);
create index if not exists idx_shelf_items_item_id on shelf_items(item_id);
create index if not exists idx_location_linen_totals_location_id on location_linen_totals(location_id);

-- enable RLS
alter table profiles enable row level security;
alter table locations enable row level security;
alter table items enable row level security;
alter table balances enable row level security;
alter table shelf_items enable row level security;
alter table shelves enable row level security;
alter table log_entries enable row level security;
alter table tasks enable row level security;
alter table laundry_batches enable row level security;
alter table laundry_batch_items enable row level security;
alter table laundry_loads enable row level security;
alter table laundry_cycle_reports enable row level security;
alter table shift_notes enable row level security;
alter table pickup_schedule enable row level security;
alter table announcements enable row level security;
alter table location_linen_totals enable row level security;
alter table user_access_roles enable row level security;

-- clean existing policies so this script is rerunnable
drop policy if exists "Users can read own profile" on profiles;
drop policy if exists "Admins can read all profiles" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Authenticated users can read locations" on locations;
drop policy if exists "Authenticated users can read items" on items;
drop policy if exists "Authenticated users can read balances" on balances;
drop policy if exists "Authenticated users can update balances" on balances;
drop policy if exists "Authenticated users can insert balances" on balances;
drop policy if exists "Authenticated users can read shelves" on shelves;
drop policy if exists "Authenticated users can insert shelves" on shelves;
drop policy if exists "Authenticated users can update shelves" on shelves;
drop policy if exists "Authenticated users can read shelf items" on shelf_items;
drop policy if exists "Authenticated users can insert shelf items" on shelf_items;
drop policy if exists "Authenticated users can update shelf items" on shelf_items;
drop policy if exists "Authenticated users can read log entries" on log_entries;
drop policy if exists "Authenticated users can insert log entries" on log_entries;
drop policy if exists "Authenticated users can read tasks" on tasks;
drop policy if exists "Authenticated users can insert tasks" on tasks;
drop policy if exists "Authenticated users can update tasks" on tasks;
drop policy if exists "Authenticated users can read laundry batches" on laundry_batches;
drop policy if exists "Authenticated users can insert laundry batches" on laundry_batches;
drop policy if exists "Authenticated users can update laundry batches" on laundry_batches;
drop policy if exists "Authenticated users can read laundry batch items" on laundry_batch_items;
drop policy if exists "Authenticated users can insert laundry batch items" on laundry_batch_items;
drop policy if exists "Authenticated users can read laundry loads" on laundry_loads;
drop policy if exists "Authenticated users can insert laundry loads" on laundry_loads;
drop policy if exists "Authenticated users can update laundry loads" on laundry_loads;
drop policy if exists "Authenticated users can read laundry cycle reports" on laundry_cycle_reports;
drop policy if exists "Authenticated users can insert laundry cycle reports" on laundry_cycle_reports;
drop policy if exists "Authenticated users can delete laundry cycle reports" on laundry_cycle_reports;
drop policy if exists "Authenticated users can read shift notes" on shift_notes;
drop policy if exists "Authenticated users can insert shift notes" on shift_notes;
drop policy if exists "Authenticated users can read pickup schedule" on pickup_schedule;
drop policy if exists "Admins can insert pickup schedule" on pickup_schedule;
drop policy if exists "Admins can delete pickup schedule" on pickup_schedule;
drop policy if exists "Authenticated users can read announcements" on announcements;
drop policy if exists "Authenticated users can read location linen totals" on location_linen_totals;
drop policy if exists "Authenticated users can update location linen totals" on location_linen_totals;
drop policy if exists "Users can read own access role" on user_access_roles;
drop policy if exists "Admins can read all access roles" on user_access_roles;

-- helper to avoid recursive RLS checks when evaluating admin status
create or replace function public.is_admin(_uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_access_roles
    where public.user_access_roles.user_id = _uid and public.user_access_roles.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.admin_list_members()
returns table (
  user_id uuid,
  email text,
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
    u.email::text as email,
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

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

create or replace function public.admin_create_user_account(
  p_email text,
  p_full_name text,
  p_temporary_password text,
  p_role text default 'staff'
)
returns table (
  user_id uuid,
  email text,
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
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(coalesce(p_role, 'staff')));
  v_name text := coalesce(nullif(trim(p_full_name), ''), 'Staff User');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can create users';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_temporary_password is null or length(p_temporary_password) < 8 then
    raise exception 'Temporary password must be at least 8 characters';
  end if;

  if v_role not in ('admin', 'staff') then
    raise exception 'Role must be admin or staff';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'A user with this email already exists';
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
    extensions.crypt(p_temporary_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', v_name, 'role', v_role),
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

  insert into public.profiles (id, full_name, role)
  values (v_user_id, v_name, v_role)
  on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role;

  return query
  select
    v_user_id as user_id,
    v_email as email,
    v_name as full_name,
    v_role as role,
    true as is_active,
    now() as created_at;
end;
$$;

revoke all on function public.admin_create_user_account(text, text, text, text) from public;
grant execute on function public.admin_create_user_account(text, text, text, text) to authenticated;

-- profiles: users can read their own, admins can read all
create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on profiles for select
  using (public.is_admin(auth.uid()));

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can read own access role"
  on user_access_roles for select
  using (auth.uid() = user_access_roles.user_id);

create policy "Admins can read all access roles"
  on user_access_roles for select
  using (public.is_admin(auth.uid()));

-- locations: all authenticated users can read
create policy "Authenticated users can read locations"
  on locations for select
  using (auth.role() = 'authenticated');

-- items: all authenticated users can read
create policy "Authenticated users can read items"
  on items for select
  using (auth.role() = 'authenticated');

-- balances: all authenticated users can read and update
create policy "Authenticated users can read balances"
  on balances for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can update balances"
  on balances for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert balances"
  on balances for insert
  with check (auth.role() = 'authenticated');

-- shelves / racks: authenticated users can read and manage
create policy "Authenticated users can read shelves"
  on shelves for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert shelves"
  on shelves for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update shelves"
  on shelves for update
  using (auth.role() = 'authenticated');

-- shelf_items: configure which items belong on each rack
create policy "Authenticated users can read shelf items"
  on shelf_items for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert shelf items"
  on shelf_items for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update shelf items"
  on shelf_items for update
  using (auth.role() = 'authenticated');

-- log entries: authenticated users can read and insert
create policy "Authenticated users can read log entries"
  on log_entries for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert log entries"
  on log_entries for insert
  with check (auth.role() = 'authenticated');

-- tasks: all authenticated users can read, insert, update
create policy "Authenticated users can read tasks"
  on tasks for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert tasks"
  on tasks for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update tasks"
  on tasks for update
  using (auth.role() = 'authenticated');

-- laundry batches: all authenticated users can read and insert
create policy "Authenticated users can read laundry batches"
  on laundry_batches for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert laundry batches"
  on laundry_batches for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update laundry batches"
  on laundry_batches for update
  using (auth.role() = 'authenticated');

-- laundry batch items
create policy "Authenticated users can read laundry batch items"
  on laundry_batch_items for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert laundry batch items"
  on laundry_batch_items for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can read laundry loads"
  on laundry_loads for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert laundry loads"
  on laundry_loads for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update laundry loads"
  on laundry_loads for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can read laundry cycle reports"
  on laundry_cycle_reports for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert laundry cycle reports"
  on laundry_cycle_reports for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete laundry cycle reports"
  on laundry_cycle_reports for delete
  using (auth.role() = 'authenticated');

-- shift notes: all authenticated users can read
create policy "Authenticated users can read shift notes"
  on shift_notes for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert shift notes"
  on shift_notes for insert
  with check (auth.role() = 'authenticated');

-- pickup schedule: all authenticated users can read
create policy "Authenticated users can read pickup schedule"
  on pickup_schedule for select
  using (auth.role() = 'authenticated');

create policy "Admins can insert pickup schedule"
  on pickup_schedule for insert
  with check (public.is_admin(auth.uid()));

create policy "Admins can delete pickup schedule"
  on pickup_schedule for delete
  using (public.is_admin(auth.uid()));

-- announcements: all authenticated users can read active ones
create policy "Authenticated users can read announcements"
  on announcements for select
  using (auth.role() = 'authenticated' and is_active = true);

-- location linen totals: authenticated users can read/update inventory counts
create policy "Authenticated users can read location linen totals"
  on location_linen_totals for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can update location linen totals"
  on location_linen_totals for update
  using (auth.role() = 'authenticated');

-- auto create profile on signup trigger
create or replace function public.handle_new_user()
returns trigger as $$
declare
  resolved_role text;
begin
  select role
  into resolved_role
  from public.user_access_roles
  where public.user_access_roles.user_id = new.id;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(initcap(replace(split_part(new.email, '@', 1), '.', ' ')), ''),
      'Staff User'
    ),
    coalesce(resolved_role, 'staff')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- when an item is assigned to a rack, ensure a zero balance row exists
create or replace function public.ensure_shelf_item_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.balances (shelf_id, location_id, item_id, current_balance)
  select new.shelf_id, s.location_id, new.item_id, 0
  from public.shelves s
  where s.id = new.shelf_id
  on conflict (shelf_id, item_id) do nothing;

  return new;
end;
$$;

drop trigger if exists shelf_items_create_balance on shelf_items;
create trigger shelf_items_create_balance
  after insert on shelf_items
  for each row execute procedure public.ensure_shelf_item_balance();

-- seed locations
insert into locations (name, mode, building) values
('Mailroom linen', 'full', 'Storage'),
('Joe west linen', 'full', 'Storage'),
('CVA OHG', 'full', 'Storage'),
('P1 Storage', 'full', 'Storage'),
('SVP', 'full', 'Storage');

-- seed location linen totals (start at zero; counts come from rack balances)
insert into location_linen_totals (location_id, linen, face_hand_towel, body_towel, pillow_case)
select id, 0, 0, 0, 0
from locations;

-- seed items
insert into items (name, label) values
('twin_sheets', 'Twin Bed Sheets'),
('pillowcases', 'Pillowcases'),
('bath_towels', 'Bath Towels'),
('hand_towels', 'Hand Towels'),
('face_towels', 'Face Towels'),
('blankets', 'Blankets');

-- seed starter racks for Mailroom (other rooms start empty; add racks later)
insert into shelves (location_id, name, qr_slug)
select l.id, rack.name, rack.qr_slug
from locations l
cross join (
  values
    ('Rack A - Towels', 'mailroom-rack-a'),
    ('Rack B - Sheets', 'mailroom-rack-b')
) as rack(name, qr_slug)
where l.name = 'Mailroom linen';

-- assign which items belong on each starter rack
insert into shelf_items (shelf_id, item_id, sort_order)
select s.id, i.id, cfg.sort_order
from shelves s
join locations l on l.id = s.location_id
join (
  values
    ('mailroom-rack-a', 'face_towels', 1),
    ('mailroom-rack-a', 'hand_towels', 2),
    ('mailroom-rack-a', 'bath_towels', 3),
    ('mailroom-rack-b', 'twin_sheets', 1),
    ('mailroom-rack-b', 'pillowcases', 2)
) as cfg(qr_slug, item_name, sort_order)
  on cfg.qr_slug = s.qr_slug
join items i on i.name = cfg.item_name
where l.name = 'Mailroom linen';

-- balances start at zero via shelf_items trigger (ensure_shelf_item_balance)

-- seed fixed access roles by UID (source of truth for admin/staff app view)
insert into user_access_roles (user_id, role) values
('268bf8c6-e2b6-4184-9dca-49453f315e26', 'admin'),
('8fbcb454-1ff9-4fc1-a757-b08742a329ff', 'staff')
on conflict on constraint user_access_roles_pkey do update set role = excluded.role;

-- backfill profiles for existing auth users and sync role from access-role table
insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(initcap(replace(split_part(u.email, '@', 1), '.', ' ')), ''),
    'Staff User'
  ),
  coalesce(uar.role, 'staff')
from auth.users u
left join public.profiles p on p.id = u.id
left join public.user_access_roles uar on uar.user_id = u.id
where p.id is null;

update public.profiles p
set role = uar.role
from public.user_access_roles uar
where p.id = uar.user_id;
