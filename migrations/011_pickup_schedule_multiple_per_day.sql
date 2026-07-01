-- Allow multiple calendar events on the same day.
-- Run in Supabase SQL Editor if adding same-day events fails with a unique constraint error.

alter table public.pickup_schedule drop constraint if exists pickup_schedule_pickup_date_key;

notify pgrst, 'reload schema';
