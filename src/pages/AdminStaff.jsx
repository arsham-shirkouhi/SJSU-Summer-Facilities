import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { getAdminMembers, adminCreateUserAccount } from '../lib/queries'
import { useAuth } from '../context/AuthContext'

const INITIAL_FORM = {
  email: '',
  fullName: '',
  temporaryPassword: '',
  role: 'staff',
}

export default function AdminStaff() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)

  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  if (normalizedRole !== 'admin') return <Navigate to="/dashboard" replace />

  const loadMembers = async () => {
    try {
      setLoading(true)
      const rows = await getAdminMembers()
      setMembers(rows)
    } catch (error) {
      toast.error(error.message || 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      const created = await adminCreateUserAccount({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        temporaryPassword: form.temporaryPassword,
        role: form.role,
      })
      setMembers((current) => [created, ...current])
      setForm(INITIAL_FORM)
      setShowCreateForm(false)
      toast.success('Account created successfully')
    } catch (error) {
      toast.error(error.message || 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1024px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-4 flex items-center justify-between border-b-[3px] border-ink pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
            <h2 className="text-[24px] font-extrabold">Staff Management</h2>
          </div>
          <button
            type="button"
            className="brutal-btn flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px] text-primary"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus size={14} />
            Create Account
          </button>
        </div>

        <section className="brutal-card bg-white p-4">
          <div className="mb-2 flex items-center gap-2 border-b-[2px] border-ink pb-2">
            <Users size={16} />
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Team Members</p>
            <span className="mono ml-auto text-[13px] font-bold">{members.length}</span>
          </div>

          {loading ? (
            <div>
              {[1, 2, 3, 4].map((idx) => (
                <div key={idx} className="skeleton mb-2 h-12 w-full" />
              ))}
            </div>
          ) : (
            <div>
              {!members.length ? (
                <p className="text-[12px] text-[#6B6B6B]">No members found.</p>
              ) : (
                members.map((member) => (
                  <div key={member.user_id} className="mb-1.5 border-b border-stone py-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold">{member.full_name || 'Staff User'}</p>
                      <span
                        className={`stamp ${member.role === 'admin' ? 'stamp-amber' : 'stamp-gray'}`}
                      >
                        {String(member.role || 'staff').toUpperCase()}
                      </span>
                    </div>
                    <p className="mono text-[10px] text-[#6B6B6B]">{member.email || 'NO EMAIL'}</p>
                    <p className="mono text-[10px] text-[#8A8A8A]">
                      Created {member.created_at ? format(new Date(member.created_at), 'MMM d, yyyy h:mm a') : '--'}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </main>
      {showCreateForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="brutal-card w-full max-w-[640px] bg-white p-5">
            <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
                <p className="text-[18px] font-extrabold uppercase">Create Staff Account</p>
              </div>
              <button
                type="button"
                className="brutal-btn bg-white px-3 py-1.5 text-[11px]"
                onClick={() => setShowCreateForm(false)}
              >
                Close ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="brutal-input"
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((state) => ({ ...state, email: event.target.value }))}
                  required
                />
                <input
                  className="brutal-input"
                  placeholder="Full Name"
                  value={form.fullName}
                  onChange={(event) => setForm((state) => ({ ...state, fullName: event.target.value }))}
                  required
                />
              </div>
              <input
                className="brutal-input mb-3"
                placeholder="Temporary Password"
                type="password"
                minLength={8}
                value={form.temporaryPassword}
                onChange={(event) =>
                  setForm((state) => ({ ...state, temporaryPassword: event.target.value }))
                }
                required
              />
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-bold uppercase">Role</p>
                <div className="flex gap-2">
                  {['staff', 'admin'].map((role) => (
                    <label
                      key={role}
                      className={`cursor-pointer border-2 px-3 py-2 text-[11px] font-bold uppercase ${
                        form.role === role ? 'border-ink bg-ink text-white' : 'border-ink bg-white text-ink'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        checked={form.role === role}
                        onChange={(event) => setForm((state) => ({ ...state, role: event.target.value }))}
                        className="sr-only"
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? 'Creating...' : 'Create User →'}
              </button>
              <p className="mt-2 text-[10px] text-[#6B6B6B]">
                User should change password after first login.
              </p>
            </form>
          </div>
        </div>
      ) : null}
      <BottomNav role="admin" />
    </div>
  )
}
