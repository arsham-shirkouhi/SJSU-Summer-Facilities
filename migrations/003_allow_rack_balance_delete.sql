-- Fix stale room counts after rack deletion.
-- Run in Supabase SQL Editor on your LIVE project.

-- 1) Allow deleting balance rows when a rack is removed
drop policy if exists "Authenticated users can delete balances" on public.balances;

create policy "Authenticated users can delete balances"
  on public.balances for delete
  using (auth.role() = 'authenticated');

-- 2) Remove counts left behind by previously deleted racks
delete from public.balances b
using public.shelves s
where b.shelf_id = s.id
  and s.is_active = false;

notify pgrst, 'reload schema';
