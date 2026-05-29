-- Reset starter/demo inventory counts to zero on live Supabase.
-- Safe to run multiple times.

update public.location_linen_totals
set
  linen = 0,
  face_hand_towel = 0,
  body_towel = 0,
  pillow_case = 0,
  updated_at = now();

update public.balances
set
  current_balance = 0,
  updated_at = now()
where current_balance <> 0;

notify pgrst, 'reload schema';
