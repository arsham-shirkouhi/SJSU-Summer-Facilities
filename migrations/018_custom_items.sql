-- Allow authenticated users to create custom inventory item types.
-- Custom items use names prefixed with custom_ (e.g. custom_mattress_pads).
--
-- If you get "deadlock detected":
--   1. Stop the app / close extra Supabase SQL tabs for ~30 seconds
--   2. Run ONLY the CREATE POLICY block below (skip DROP if this is a retry)
--   3. Do NOT run notify pgrst in the same batch as DDL on a live DB
--
-- Safe to run on live DB when traffic is low.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'items'
      and policyname = 'Authenticated users can insert custom items'
  ) then
    create policy "Authenticated users can insert custom items"
      on public.items for insert
      with check (
        auth.role() = 'authenticated'
        and starts_with(name, 'custom_')
      );
  end if;
end $$;
