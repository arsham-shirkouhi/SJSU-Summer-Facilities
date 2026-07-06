-- Standardize rack linen types:
-- pillows, blankets, pillow cases, top sheets, face towels, body towels
-- Run in Supabase SQL Editor.

UPDATE public.items SET label = 'Pillow Cases' WHERE name = 'pillowcases';
UPDATE public.items SET label = 'Blankets' WHERE name = 'blankets';

UPDATE public.items
SET name = 'face_towels', label = 'Face Towels', is_active = true
WHERE name = 'hand_towels'
  AND NOT EXISTS (SELECT 1 FROM public.items other WHERE other.name = 'face_towels');

INSERT INTO public.items (name, label, is_active)
SELECT 'face_towels', 'Face Towels', true
WHERE NOT EXISTS (SELECT 1 FROM public.items WHERE name = 'face_towels');

UPDATE public.items SET label = 'Face Towels', is_active = true WHERE name = 'face_towels';

UPDATE public.items
SET name = 'body_towels', label = 'Body Towels'
WHERE name = 'bath_towels'
  AND NOT EXISTS (SELECT 1 FROM public.items other WHERE other.name = 'body_towels');

UPDATE public.items
SET name = 'top_sheets', label = 'Top Sheets'
WHERE name = 'twin_sheets'
  AND NOT EXISTS (SELECT 1 FROM public.items other WHERE other.name = 'top_sheets');

UPDATE public.items SET label = 'Body Towels', is_active = true WHERE name = 'body_towels';
UPDATE public.items SET label = 'Top Sheets', is_active = true WHERE name = 'top_sheets';

INSERT INTO public.items (name, label, is_active)
SELECT 'pillows', 'Pillows', true
WHERE NOT EXISTS (SELECT 1 FROM public.items WHERE name = 'pillows');

UPDATE public.items SET label = 'Pillows', is_active = true WHERE name = 'pillows';

UPDATE public.items SET is_active = false WHERE name IN ('hand_towels', 'bath_towels', 'twin_sheets');

UPDATE public.items
SET is_active = true
WHERE name IN ('pillows', 'blankets', 'pillowcases', 'top_sheets', 'face_towels', 'body_towels');

notify pgrst, 'reload schema';
