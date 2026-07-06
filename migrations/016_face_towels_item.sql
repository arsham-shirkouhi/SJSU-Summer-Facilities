-- Ensure Face Towels exists for rack setup (run if already applied 015 without face_towels insert).
-- Run in Supabase SQL Editor.

UPDATE public.items
SET name = 'face_towels', label = 'Face Towels', is_active = true
WHERE name = 'hand_towels'
  AND NOT EXISTS (SELECT 1 FROM public.items other WHERE other.name = 'face_towels');

INSERT INTO public.items (name, label, is_active)
SELECT 'face_towels', 'Face Towels', true
WHERE NOT EXISTS (SELECT 1 FROM public.items WHERE name = 'face_towels');

UPDATE public.items SET label = 'Face Towels', is_active = true WHERE name = 'face_towels';

UPDATE public.items SET is_active = false WHERE name = 'hand_towels';

notify pgrst, 'reload schema';
