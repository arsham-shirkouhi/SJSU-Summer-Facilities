-- Physical rack units with short codes (e.g. OG02) and multiple shelves per rack.
-- Safe to run on live DB — does not wipe data.

create table if not exists public.rack_units (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  rack_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create unique index if not exists rack_units_rack_code_key
  on public.rack_units (upper(rack_code))
  where rack_code is not null and is_active = true;

alter table public.shelves
  add column if not exists rack_unit_id uuid references public.rack_units (id) on delete cascade,
  add column if not exists shelf_level integer not null default 1,
  add column if not exists shelf_label text;

create unique index if not exists shelves_rack_unit_level_key
  on public.shelves (rack_unit_id, shelf_level)
  where rack_unit_id is not null and is_active = true;

create index if not exists idx_shelves_rack_unit_id on public.shelves (rack_unit_id);
create index if not exists idx_rack_units_location_id on public.rack_units (location_id);

alter table public.rack_units enable row level security;

drop policy if exists "Authenticated users can read rack units" on public.rack_units;
drop policy if exists "Authenticated users can insert rack units" on public.rack_units;
drop policy if exists "Authenticated users can update rack units" on public.rack_units;

create policy "Authenticated users can read rack units"
  on public.rack_units for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert rack units"
  on public.rack_units for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update rack units"
  on public.rack_units for update
  using (auth.role() = 'authenticated');

-- Backfill: one rack unit per existing active shelf
do $$
declare
  shelf_row record;
  new_unit_id uuid;
begin
  for shelf_row in
    select id, location_id, name
    from public.shelves
    where rack_unit_id is null and coalesce(is_active, true) = true
  loop
    insert into public.rack_units (location_id, name)
    values (shelf_row.location_id, shelf_row.name)
    returning id into new_unit_id;

    update public.shelves
    set
      rack_unit_id = new_unit_id,
      shelf_level = 1,
      shelf_label = coalesce(shelf_label, 'Shelf 1')
    where id = shelf_row.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
