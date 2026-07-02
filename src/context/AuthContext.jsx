import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { clearLocationsCache, getProfile } from '../lib/queries'
import { pinToAuthCredentials } from '../lib/pinAuth'

const AuthContext = createContext(null)
const normalizeRole = (role) => String(role || '').trim().toLowerCase()
const LOCAL_ADMIN_EMAILS = new Set(
  String(import.meta.env.VITE_LOCAL_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)
const isLocalAdminEmail = (email) => LOCAL_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase())
const resolveRole = (baseRole, sessionUser) =>
  isLocalAdminEmail(sessionUser?.email) ? 'admin' : normalizeRole(baseRole) || 'staff'

const buildFallbackProfile = (sessionUser) => {
  const metadata = sessionUser?.user_metadata || {}
  const appMetadata = sessionUser?.app_metadata || {}
  const emailPrefix = String(sessionUser?.email || '')
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim()

  return {
    id: sessionUser?.id,
    full_name: metadata.full_name || emailPrefix || 'Staff User',
    role: resolveRole(metadata.role || appMetadata.role, sessionUser),
    location_access: null,
    is_active: true,
    created_at: null,
  }
}

async function loadProfileForUser(sessionUser) {
  const metadataRole = sessionUser?.user_metadata?.role || sessionUser?.app_metadata?.role

  try {
    const profileData = await getProfile(sessionUser.id)
    if (!profileData) return buildFallbackProfile(sessionUser)

    const dbRole = normalizeRole(profileData.role)
    const metaRole = normalizeRole(metadataRole)
    let role = resolveRole(profileData.role || metadataRole, sessionUser)

    if (!profileData.roleFromAccessTable && metaRole === 'admin' && dbRole === 'staff') {
      role = resolveRole('admin', sessionUser)
    }

    const { roleFromAccessTable: _roleFromAccessTable, ...profile } = profileData
    return { ...profile, role }
  } catch (_error) {
    return buildFallbackProfile(sessionUser)
  }
}

export function LoadingScreen() {
  return (
    <div
      className="linentrack-loading-screen"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f0e8',
        color: '#001a57',
      }}
    >
      <div
        className="linentrack-loading-word"
        style={{
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: '#001a57',
        }}
      >
        LINENTRACK
      </div>
    </div>
  )
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const signingOutRef = useRef(false)
  const profileRequestIdRef = useRef(0)

  const loading = !sessionReady || (Boolean(user?.id) && !profileReady)

  useEffect(() => {
    let mounted = true

    const clearLocalAuth = async () => {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch (_error) {
        // Ignore local sign-out failures.
      }
    }

    const initAuth = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise((resolve) => {
            setTimeout(() => resolve({ timedOut: true }), 10000)
          }),
        ])

        if (result?.timedOut) throw new Error('Auth init timed out')
        if (!mounted || signingOutRef.current) return

        const { data, error } = result
        if (error) throw error
        setUser(data.session?.user ?? null)
      } catch (_error) {
        await clearLocalAuth()
        if (mounted && !signingOutRef.current) {
          setUser(null)
          setProfile(null)
          setProfileReady(true)
        }
      } finally {
        if (mounted) setSessionReady(true)
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (signingOutRef.current && event !== 'SIGNED_OUT') return
      if (!mounted) return
      clearLocationsCache()
      setUser(session?.user ?? null)
      setSessionReady(true)
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (!session) {
          setProfile(null)
          setProfileReady(true)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionReady) return undefined

    if (!user?.id) {
      setProfile(null)
      setProfileReady(true)
      return undefined
    }

    let cancelled = false
    const requestId = ++profileRequestIdRef.current
    setProfileReady(false)

    loadProfileForUser(user)
      .then((nextProfile) => {
        if (cancelled || requestId !== profileRequestIdRef.current) return
        setProfile(nextProfile)
      })
      .catch(() => {
        if (cancelled || requestId !== profileRequestIdRef.current) return
        setProfile(buildFallbackProfile(user))
      })
      .finally(() => {
        if (cancelled || requestId !== profileRequestIdRef.current) return
        setProfileReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [sessionReady, user?.id])

  const signInWithPin = async (pin) => {
    const { email, password } = pinToAuthCredentials(pin)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    const sessionUser = data?.user ?? data?.session?.user ?? null
    if (sessionUser) {
      setUser(sessionUser)
      setSessionReady(true)
    }

    return data
  }

  const signOut = async () => {
    signingOutRef.current = true
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } catch (_error) {
      // Even if remote sign-out fails, clear local state so UI can recover.
    } finally {
      setUser(null)
      setProfile(null)
      setProfileReady(true)
      setSessionReady(true)
      navigate('/login', { replace: true })
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
      signingOutRef.current = false
      setSigningOut(false)
    }
  }

  const value = useMemo(
    () => ({ user, profile, loading, signingOut, signInWithPin, signOut, LoadingScreen }),
    [user, profile, loading, signingOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
