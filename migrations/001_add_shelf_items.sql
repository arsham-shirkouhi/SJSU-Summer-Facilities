-- Safe migration: adds rack item configuration without wiping existing data.
-- Run this in Supabase -> SQL Editor on your LIVE project (do NOT run full schema.sql).

-- 1) Extend shelves table for rack management
alter table public.shelves
  add column if not exists qr_slug text,
  add column if not exists is_active boolean not null default true;

create unique index if not exists shelves_qr_slug_key on public.shelves (qr_slug);
create unique index if not exists shelves_location_id_name_key on public.shelves (location_id, name);
create index if not exists idx_shelves_location_id on public.shelves (location_id);

-- 2) Create shelf_items (links racks to allowed linen types)
create table if not exists public.shelf_items (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references public.shelves (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shelf_id, item_id)
);

create index if not exists idx_shelf_items_shelf_id on public.shelf_items (shelf_id);
create index if not exists idx_shelf_items_item_id on public.shelf_items (item_id);

-- 3) Auto-create zero balance rows when items are assigned to a rack
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

drop trigger if exists shelf_items_create_balance on public.shelf_items;
create trigger shelf_items_create_balance
  after insert on public.shelf_items
  for each row execute procedure public.ensure_shelf_item_balance();

-- 4) RLS for shelf_items + rack insert/update
alter table public.shelf_items enable row level security;

drop policy if exists "Authenticated users can read shelf items" on public.shelf_items;
drop policy if exists "Authenticated users can insert shelf items" on public.shelf_items;
drop policy if exists "Authenticated users can update shelf items" on public.shelf_items;

create policy "Authenticated users can read shelf items"
  on public.shelf_items for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can insert shelf items"
  on public.shelf_items for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update shelf items"
  on public.shelf_items for update
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert shelves" on public.shelves;
drop policy if exists "Authenticated users can update shelves" on public.shelves;

create policy "Authenticated users can insert shelves"
  on public.shelves for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update shelves"
  on public.shelves for update
  using (auth.role() = 'authenticated');

-- 5) Backfill: if a rack already has balances, treat those as configured rack items
insert into public.shelf_items (shelf_id, item_id, sort_order)
select b.shelf_id, b.item_id, row_number() over (partition by b.shelf_id order by b.item_id)
from public.balances b
where b.shelf_id is not null and b.item_id is not null
on conflict (shelf_id, item_id) do nothing;

-- 6) Tell PostgREST to reload schema cache (fixes "relationship not found" errors)
notify pgrst, 'reload schema';
