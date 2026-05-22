# LinenTrack

Neobrutalist linen inventory dashboard for SJSU Summer Housing.

## Setup

1. Run `npm install`
2. Run `npm run dev`
3. Create a Supabase project at [supabase.com](https://supabase.com)
4. Run `schema.sql` in the Supabase SQL editor
5. Copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Create a storage bucket called `proof-photos` set to public in Supabase Storage
7. Create your first admin user in Supabase Auth dashboard and set:
   - `raw_user_meta_data` to `{"full_name": "Your Name", "role": "admin"}`
