-- Weekly pickup/drop-off missions: groups of dirty linen counts until mission is completed.
-- Run in Supabase SQL Editor.

create table if not exists public.pickup_missions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_by uuid references public.profiles on delete set null,
  completed_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists pickup_missions_one_active_idx
  on public.pickup_missions ((true))
  where status = 'active';

create table if not exists public.pickup_mission_groups (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.pickup_missions on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  face_towels integer not null default 0 check (face_towels >= 0),
  body_towels integer not null default 0 check (body_towels >= 0),
  top_sheets integer not null default 0 check (top_sheets >= 0),
  pillow_cases integer not null default 0 check (pillow_cases >= 0),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pickup_mission_groups_mission_id_idx
  on public.pickup_mission_groups (mission_id);

create index if not exists pickup_missions_completed_at_idx
  on public.pickup_missions (completed_at desc nulls last);

alter table public.pickup_missions enable row level security;
alter table public.pickup_mission_groups enable row level security;

drop policy if exists "Authenticated users can read pickup missions" on public.pickup_missions;
create policy "Authenticated users can read pickup missions"
  on public.pickup_missions for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert pickup missions" on public.pickup_missions;
create policy "Authenticated users can insert pickup missions"
  on public.pickup_missions for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update pickup missions" on public.pickup_missions;
create policy "Authenticated users can update pickup missions"
  on public.pickup_missions for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read pickup mission groups" on public.pickup_mission_groups;
create policy "Authenticated users can read pickup mission groups"
  on public.pickup_mission_groups for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert pickup mission groups" on public.pickup_mission_groups;
create policy "Authenticated users can insert pickup mission groups"
  on public.pickup_mission_groups for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update pickup mission groups" on public.pickup_mission_groups;
create policy "Authenticated users can update pickup mission groups"
  on public.pickup_mission_groups for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete pickup mission groups" on public.pickup_mission_groups;
create policy "Authenticated users can delete pickup mission groups"
  on public.pickup_mission_groups for delete
  using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
