import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { clearLocationsCache, getProfile } from '../lib/queries'

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

export function LoadingScreen() {
  return (
    <div className="linentrack-loading-screen">
      <div className="linentrack-loading-word">LINENTRACK</div>
    </div>
  )
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const signingOutRef = useRef(false)

  useEffect(() => {
    let mounted = true
    const bootstrapTimeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 3000)

    const initSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        const sessionUser = data?.session?.user ?? null
        if (!mounted || signingOutRef.current) return

        setUser(sessionUser)
        if (sessionUser) {
          try {
            const profileData = await getProfile(sessionUser.id)
            if (mounted) {
              if (profileData) {
                setProfile({
                  ...profileData,
                  role: resolveRole(profileData?.role, sessionUser),
                })
              } else {
                setProfile(buildFallbackProfile(sessionUser))
              }
            }
          } catch (_error) {
            if (mounted) setProfile(buildFallbackProfile(sessionUser))
          }
        } else {
          setProfile(null)
        }
      } catch (error) {
        if (mounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (signingOutRef.current && event !== 'SIGNED_OUT') return
      clearLocationsCache()
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      if (sessionUser) {
        try {
          const profileData = await getProfile(sessionUser.id)
          if (mounted) {
            if (profileData) {
              setProfile({
                ...profileData,
                role: resolveRole(profileData?.role, sessionUser),
              })
            } else {
              setProfile(buildFallbackProfile(sessionUser))
            }
          }
        } catch (_error) {
          if (mounted) {
            setProfile((current) => {
              if (current?.id === sessionUser.id && normalizeRole(current?.role)) return current
              return buildFallbackProfile(sessionUser)
            })
          }
        }
      } else if (mounted) {
        setProfile(null)
      }

      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      clearTimeout(bootstrapTimeout)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    signingOutRef.current = true
    setSigningOut(true)
    try {
      // Use full sign-out so refresh tokens are revoked and session does not rehydrate.
      await supabase.auth.signOut()
    } catch (_error) {
      // Even if remote sign-out fails, clear local state so UI can recover.
    } finally {
      setUser(null)
      setProfile(null)
      setLoading(false)
      navigate('/login', { replace: true })
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
      signingOutRef.current = false
      setSigningOut(false)
    }
  }

  const value = useMemo(
    () => ({ user, profile, loading, signingOut, signIn, signOut, LoadingScreen }),
    [user, profile, loading, signingOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
