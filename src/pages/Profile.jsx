import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'

const normalizeRole = (role) => String(role || '').trim().toLowerCase()

export default function Profile() {
  const { user, profile, signOut, signingOut } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  const role = normalizeRole(profile?.role)
  const navRole = role === 'admin' ? 'admin' : 'staff'

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[720px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <section className="mb-6 border-b-[3px] border-ink pb-4">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Profile</p>
          <h2 className="text-[24px] font-extrabold">{profile?.full_name || 'Staff User'}</h2>
          <p className="mono mt-2 text-[18px] font-bold text-primary">
            Login Code · {profile?.pin_code || '----'}
          </p>
          <p className="mono mt-1 text-[11px] text-[#6B6B6B]">
            {profile?.contact_email || 'No contact email on file'}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
            Role: {role || 'staff'}
          </p>
        </section>

        <section className="brutal-card mb-4 bg-white p-4">
          <p className="mb-2 text-[12px] font-extrabold uppercase">Login Code</p>
          <p className="text-[12px] text-[#6B6B6B]">
            Use your 4-digit code on the login screen. Contact an administrator if you need a new code.
          </p>
        </section>

        <section className="brutal-card bg-white p-4">
          <p className="mb-3 text-[12px] font-extrabold uppercase">Session</p>
          <button
            type="button"
            className="brutal-btn w-full border-[2px] border-danger bg-danger-light py-2.5 text-[12px] font-bold text-danger"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing Out...' : 'Log Out'}
          </button>
        </section>
      </main>
      <BottomNav role={navRole} />
    </div>
  )
}
