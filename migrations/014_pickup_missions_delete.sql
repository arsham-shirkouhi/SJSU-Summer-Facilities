-- Allow deleting completed pickup missions (groups cascade).
-- Run in Supabase SQL Editor.

drop policy if exists "Authenticated users can delete pickup missions" on public.pickup_missions;
create policy "Authenticated users can delete pickup missions"
  on public.pickup_missions for delete
  using (auth.role() = 'authenticated');

notify pgrst, 'reload schema';
