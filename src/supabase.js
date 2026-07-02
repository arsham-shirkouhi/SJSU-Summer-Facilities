import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

const safeStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key)
    } catch (_error) {
      return null
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch (_error) {
      // Safari private mode / blocked storage should not crash the app.
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key)
    } catch (_error) {
      // Ignore storage failures.
    }
  },
}

if (!hasSupabaseConfig) {
  console.error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.',
  )
}

export const supabase = createClient(supabaseUrl || 'https://invalid.local', supabaseAnonKey || 'invalid', {
  auth: {
    storage: safeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
