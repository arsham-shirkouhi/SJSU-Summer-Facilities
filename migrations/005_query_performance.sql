-- Faster inventory/dashboard reads. Run in Supabase SQL Editor.

create index if not exists idx_shelves_location_active on public.shelves (location_id) where is_active = true;
create index if not exists idx_log_entries_location_created_at on public.log_entries (location_id, created_at desc);

drop function if exists public.get_storage_room_summaries();
drop function if exists public.get_linen_counts_by_room();

create or replace function public.get_storage_room_summaries()
returns table (
  id uuid,
  name text,
  building text,
  low_threshold integer,
  critical_threshold integer,
  total_bundles bigint,
  last_count_time timestamptz,
  last_count_staff text
)
language sql
stable
security invoker
set search_path = public
as $$
  with room_totals as (
    select
      s.location_id,
      coalesce(sum(b.current_balance), 0)::bigint as total_bundles,
      max(b.updated_at) as latest_balance_update
    from public.shelves s
    left join public.balances b on b.shelf_id = s.id
    where s.is_active = true
    group by s.location_id
  ),
  latest_logs as (
    select distinct on (le.location_id)
      le.location_id,
      le.created_at,
      le.staff_name
    from public.log_entries le
    where le.location_id is not null
    order by le.location_id, le.created_at desc
  )
  select
    l.id,
    l.name,
    l.building,
    l.low_threshold,
    l.critical_threshold,
    coalesce(rt.total_bundles, 0) as total_bundles,
    coalesce(ll.created_at, rt.latest_balance_update) as last_count_time,
    ll.staff_name as last_count_staff
  from public.locations l
  left join room_totals rt on rt.location_id = l.id
  left join latest_logs ll on ll.location_id = l.id
  where l.is_active = true
    and l.mode = 'full'
  order by l.created_at asc;
$$;

create or replace function public.get_linen_counts_by_room()
returns table (
  location_id uuid,
  location_name text,
  item_id uuid,
  item_label text,
  current_balance integer,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.location_id,
    loc.name as location_name,
    b.item_id,
    i.label as item_label,
    b.current_balance,
    b.updated_at
  from public.balances b
  inner join public.shelves s on s.id = b.shelf_id and s.is_active = true
  inner join public.locations loc on loc.id = b.location_id and loc.is_active = true
  inner join public.items i on i.id = b.item_id and i.is_active = true
  where b.current_balance > 0 or b.updated_at is not null
  order by loc.name asc, i.label asc;
$$;

revoke all on function public.get_storage_room_summaries() from public;
grant execute on function public.get_storage_room_summaries() to authenticated;

revoke all on function public.get_linen_counts_by_room() from public;
grant execute on function public.get_linen_counts_by_room() to authenticated;

notify pgrst, 'reload schema';
