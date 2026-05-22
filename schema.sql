-- WARNING: this script resets LinenTrack tables and seed data.
-- Run only when you want to overwrite previous project data.
create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists laundry_batch_items cascade;
drop table if exists laundry_batches cascade;
drop table if exists laundry_loads cascade;
drop table if exists laundry_cycle_reports cascade;
drop table if exists log_entries cascade;
drop table if exists balances cascade;
drop table if exists shelves cascade;
drop table if exists location_linen_totals cascade;
drop table if exists tasks cascade;
drop table if exists shift_notes cascade;
drop table if exists pickup_schedule cascade;
drop table if exists announcements cascade;
drop table if exists items cascade;
drop table if exists locations cascade;
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

-- locations (storage rooms)
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null default 'full',
  building text,
  is_active boolean default true,
  low_threshold integer default 15,
  critical_threshold integer default 5,
  created_at timestamptz default now()
);

-- items (linen types)
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  label text not null,
  is_active boolean default true
);

-- shelves (within each storage room)
create table shelves (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- location linen totals (quick count snapshot per room)
create table location_linen_totals (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references locations on delete cascade,
  linen integer not null default 0,
  face_hand_towel integer not null default 0,
  body_towel integer not null default 0,
  pillow_case integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- balances (bundle count per shelf per item)
create table balances (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid references shelves on delete cascade,
  location_id uuid references locations,
  item_id uuid references items,
  current_balance integer default 0,
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
  assigned_date date not null default current_date,
  status text default 'pending',
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
create index if not exists idx_location_linen_totals_location_id on location_linen_totals(location_id);

-- enable RLS
alter table profiles enable row level security;
alter table locations enable row level security;
alter table items enable row level security;
alter table balances enable row level security;
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

-- profiles: users can read their own, admins can read all
create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Admins can read all profiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

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

-- shelves: all authenticated users can read
create policy "Authenticated users can read shelves"
  on shelves for select
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
  with check (auth.role() = 'authenticated');

create policy "Admins can delete pickup schedule"
  on pickup_schedule for delete
  using (auth.role() = 'authenticated');

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
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(initcap(replace(split_part(new.email, '@', 1), '.', ' ')), ''),
      'Staff User'
    ),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'staff') in ('admin', 'staff')
        then coalesce(new.raw_user_meta_data->>'role', 'staff')
      else 'staff'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- seed locations
insert into locations (name, mode, building) values
('Mailroom linen', 'full', 'Storage'),
('Joe west linen', 'full', 'Storage'),
('CVA OHG', 'full', 'Storage'),
('P1 Storage', 'full', 'Storage'),
('SVP', 'full', 'Storage');

-- seed location linen totals (one row per location with starter counts)
insert into location_linen_totals (location_id, linen, face_hand_towel, body_towel, pillow_case)
select
  id,
  case
    when name = 'Mailroom linen' then 120
    when name = 'Joe west linen' then 95
    when name = 'CVA OHG' then 78
    when name = 'P1 Storage' then 64
    when name = 'SVP' then 88
    else 0
  end as linen,
  case
    when name = 'Mailroom linen' then 80
    when name = 'Joe west linen' then 60
    when name = 'CVA OHG' then 52
    when name = 'P1 Storage' then 45
    when name = 'SVP' then 57
    else 0
  end as face_hand_towel,
  case
    when name = 'Mailroom linen' then 70
    when name = 'Joe west linen' then 58
    when name = 'CVA OHG' then 49
    when name = 'P1 Storage' then 40
    when name = 'SVP' then 54
    else 0
  end as body_towel,
  case
    when name = 'Mailroom linen' then 110
    when name = 'Joe west linen' then 86
    when name = 'CVA OHG' then 72
    when name = 'P1 Storage' then 59
    when name = 'SVP' then 79
    else 0
  end as pillow_case
from locations;

-- seed items
insert into items (name, label) values
('twin_sheets', 'Twin Bed Sheets'),
('pillowcases', 'Pillowcases'),
('bath_towels', 'Bath Towels'),
('hand_towels', 'Hand Towels'),
('blankets', 'Blankets');
