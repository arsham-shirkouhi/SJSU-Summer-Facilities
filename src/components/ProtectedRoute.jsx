import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, LoadingScreen } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, profile, loading, signOut } = useAuth()
  const [slowLoad, setSlowLoad] = useState(false)

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false)
      return undefined
    }

    const timer = setTimeout(() => setSlowLoad(true), 12000)
    return () => clearTimeout(timer)
  }, [loading])

  if (loading) {
    return (
      <>
        <LoadingScreen />
        {slowLoad ? (
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 24,
              zIndex: 60,
              display: 'flex',
              justifyContent: 'center',
              padding: '0 16px',
            }}
          >
            <button
              type="button"
              onClick={() => signOut()}
              style={{
                border: '2.5px solid #001a57',
                background: '#fff',
                color: '#001a57',
                padding: '10px 14px',
                fontWeight: 700,
              }}
            >
              Stuck loading? Go to login
            </button>
          </div>
        ) : null}
      </>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <LoadingScreen />
  return children
}
