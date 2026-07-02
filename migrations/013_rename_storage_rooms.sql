-- Rename storage room display names.
-- Run in Supabase SQL Editor.

update public.locations
set name = 'Mailroom Storage'
where name = 'Mailroom linen';

update public.locations
set name = 'OGH'
where name = 'CVA OGH';

notify pgrst, 'reload schema';
