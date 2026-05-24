import { useState } from 'react'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'

const normalizeRole = (role) => String(role || '').trim().toLowerCase()

export default function Profile() {
  const { user, profile, signOut, signingOut } = useAuth()
  const [form, setForm] = useState({
    password: '',
    confirmPassword: '',
  })
  const [savingPassword, setSavingPassword] = useState(false)

  if (!user) return <Navigate to="/login" replace />

  const role = normalizeRole(profile?.role)
  const navRole = role === 'admin' ? 'admin' : 'staff'

  const handleChangePassword = async (event) => {
    event.preventDefault()

    const trimmedPassword = form.password.trim()
    const trimmedConfirm = form.confirmPassword.trim()

    if (!trimmedPassword || !trimmedConfirm) {
      toast.error('Enter and confirm your new password')
      return
    }
    if (trimmedPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (trimmedPassword !== trimmedConfirm) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setSavingPassword(true)
      const { error } = await supabase.auth.updateUser({ password: trimmedPassword })
      if (error) throw error
      setForm({ password: '', confirmPassword: '' })
      toast.success('Password updated')
    } catch (error) {
      toast.error(error.message || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[720px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <section className="mb-6 border-b-[3px] border-ink pb-4">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Profile</p>
          <h2 className="text-[24px] font-extrabold">{profile?.full_name || 'Staff User'}</h2>
          <p className="mono mt-1 text-[11px] text-[#6B6B6B]">{user?.email || 'No email available'}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
            Role: {role || 'staff'}
          </p>
        </section>

        <section className="brutal-card mb-4 bg-white p-4">
          <p className="mb-3 text-[12px] font-extrabold uppercase">Change Password</p>
          <form onSubmit={handleChangePassword}>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">
              New Password
            </label>
            <input
              type="password"
              className="brutal-input mb-3"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              autoComplete="new-password"
              required
            />

            <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">
              Confirm Password
            </label>
            <input
              type="password"
              className="brutal-input mb-3"
              placeholder="Re-enter new password"
              value={form.confirmPassword}
              onChange={(event) =>
                setForm((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              autoComplete="new-password"
              required
            />

            <button
              type="submit"
              className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white"
              disabled={savingPassword}
            >
              {savingPassword ? 'Saving...' : 'Update Password →'}
            </button>
          </form>
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
