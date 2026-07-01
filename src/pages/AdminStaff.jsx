import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import {
  adminCreateUserAccount,
  adminDeleteUserAccount,
  adminUpdateUserAccount,
  getAdminMembers,
} from '../lib/queries'
import { normalizePinCode } from '../lib/pinAuth'
import { useAuth } from '../context/AuthContext'
import { SkeletonStaffRow } from '../components/Skeleton'

const INITIAL_FORM = {
  fullName: '',
  contactEmail: '',
  pinCode: '',
  role: 'staff',
}

function MemberFormFields({ form, setForm, idPrefix = 'member' }) {
  return (
    <>
      <input
        className="brutal-input mb-2"
        placeholder="Full Name"
        value={form.fullName}
        onChange={(event) => setForm((state) => ({ ...state, fullName: event.target.value }))}
        required
      />
      <input
        className="brutal-input mb-2"
        placeholder="Contact Email"
        type="email"
        value={form.contactEmail}
        onChange={(event) => setForm((state) => ({ ...state, contactEmail: event.target.value }))}
        required
      />
      <input
        className="brutal-input mb-3 text-center font-bold tracking-[0.35em]"
        placeholder="4-digit login code"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        value={form.pinCode}
        onChange={(event) =>
          setForm((state) => ({
            ...state,
            pinCode: event.target.value.replace(/\D/g, '').slice(0, 4),
          }))
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
                name={`${idPrefix}-role`}
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
    </>
  )
}

export default function AdminStaff() {
  const { profile, user } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [memberToEdit, setMemberToEdit] = useState(null)
  const [memberToDelete, setMemberToDelete] = useState(null)
  const [deletePinConfirm, setDeletePinConfirm] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [editForm, setEditForm] = useState(INITIAL_FORM)

  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  if (normalizedRole !== 'admin') return <Navigate to="/dashboard" replace />

  const deletePinMatches = useMemo(() => {
    if (!memberToDelete?.pin_code) return false
    return normalizePinCode(deletePinConfirm) === memberToDelete.pin_code
  }, [deletePinConfirm, memberToDelete])

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
    const pinCode = normalizePinCode(form.pinCode)
    if (!pinCode) {
      toast.error('Login code must be exactly 4 digits')
      return
    }

    try {
      setSubmitting(true)
      const created = await adminCreateUserAccount({
        fullName: form.fullName.trim(),
        contactEmail: form.contactEmail.trim(),
        pinCode,
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

  const openEditModal = (member) => {
    setMemberToEdit(member)
    setEditForm({
      fullName: member.full_name || '',
      contactEmail: member.contact_email || '',
      pinCode: member.pin_code || '',
      role: member.role || 'staff',
    })
  }

  const closeEditModal = () => {
    setMemberToEdit(null)
    setEditForm(INITIAL_FORM)
  }

  const handleEditSubmit = async (event) => {
    event.preventDefault()
    if (!memberToEdit?.user_id) return

    const pinCode = normalizePinCode(editForm.pinCode)
    if (!pinCode) {
      toast.error('Login code must be exactly 4 digits')
      return
    }

    try {
      setSubmitting(true)
      const updated = await adminUpdateUserAccount({
        userId: memberToEdit.user_id,
        fullName: editForm.fullName.trim(),
        contactEmail: editForm.contactEmail.trim(),
        pinCode,
        role: editForm.role,
      })
      setMembers((current) =>
        current.map((member) => (member.user_id === memberToEdit.user_id ? updated : member)),
      )
      toast.success('Staff account updated')
      closeEditModal()
    } catch (error) {
      toast.error(error.message || 'Failed to update account')
    } finally {
      setSubmitting(false)
    }
  }

  const openDeleteModal = (member) => {
    setMemberToDelete(member)
    setDeletePinConfirm('')
  }

  const closeDeleteModal = () => {
    setMemberToDelete(null)
    setDeletePinConfirm('')
  }

  const handleDeleteMember = async () => {
    if (!memberToDelete?.pin_code || !deletePinMatches) return

    try {
      setDeleting(true)
      await adminDeleteUserAccount(memberToDelete.pin_code)
      setMembers((current) => current.filter((member) => member.user_id !== memberToDelete.user_id))
      toast.success('Staff account deleted')
      closeDeleteModal()
    } catch (error) {
      toast.error(error.message || 'Failed to delete account')
    } finally {
      setDeleting(false)
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
                <SkeletonStaffRow key={idx} />
              ))}
            </div>
          ) : (
            <div>
              {!members.length ? (
                <p className="text-[12px] text-[#6B6B6B]">No members found.</p>
              ) : (
                members.map((member) => {
                  const isSelf = member.user_id === user?.id
                  return (
                    <div key={member.user_id} className="mb-1.5 border-b border-stone py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold">{member.full_name || 'Staff User'}</p>
                            <span
                              className={`stamp ${member.role === 'admin' ? 'stamp-amber' : 'stamp-gray'}`}
                            >
                              {String(member.role || 'staff').toUpperCase()}
                            </span>
                            {isSelf ? <span className="stamp stamp-blue">YOU</span> : null}
                          </div>
                          <p className="mono text-[12px] font-bold text-primary">
                            Code · {member.pin_code || '----'}
                          </p>
                          <p className="mono text-[10px] text-[#6B6B6B]">
                            {member.contact_email || 'No contact email'}
                          </p>
                          <p className="mono text-[10px] text-[#8A8A8A]">
                            Created{' '}
                            {member.created_at
                              ? format(new Date(member.created_at), 'MMM d, yyyy h:mm a')
                              : '--'}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="brutal-btn flex items-center gap-1 bg-white px-2 py-1 text-[10px]"
                            onClick={() => openEditModal(member)}
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          {!isSelf ? (
                            <button
                              type="button"
                              className="brutal-btn flex items-center gap-1 bg-danger-light px-2 py-1 text-[10px]"
                              onClick={() => openDeleteModal(member)}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </section>
      </main>

      {showCreateForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
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
              <MemberFormFields form={form} setForm={setForm} idPrefix="create" />
              <button
                type="submit"
                className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
                disabled={submitting || form.pinCode.length !== 4}
              >
                {submitting ? 'Creating...' : 'Create User →'}
              </button>
              <p className="mt-2 text-[10px] text-[#6B6B6B]">
                Share the 4-digit code for login. Contact email is kept for announcements and blasts.
              </p>
            </form>
          </div>
        </div>
      ) : null}

      {memberToEdit ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/50 px-4">
          <div className="brutal-card w-full max-w-[640px] bg-white p-5">
            <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
                <p className="text-[18px] font-extrabold uppercase">Edit Staff Account</p>
              </div>
              <button
                type="button"
                className="brutal-btn bg-white px-3 py-1.5 text-[11px]"
                onClick={closeEditModal}
              >
                Close ✕
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <MemberFormFields form={editForm} setForm={setEditForm} idPrefix="edit" />
              <button
                type="submit"
                className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
                disabled={submitting || editForm.pinCode.length !== 4}
              >
                {submitting ? 'Saving...' : 'Save Changes →'}
              </button>
              <p className="mt-2 text-[10px] text-[#6B6B6B]">
                Changing the login code updates what they use to sign in.
              </p>
            </form>
          </div>
        </div>
      ) : null}

      {memberToDelete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-4">
          <div className="brutal-card w-full max-w-[520px] bg-white p-5">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Delete Staff Account</p>
            <h3 className="mt-1 text-[18px] font-extrabold uppercase">
              {memberToDelete.full_name || 'Staff User'}
            </h3>
            <p className="mono mt-1 text-[11px] text-[#6B6B6B]">Code · {memberToDelete.pin_code}</p>
            <p className="mt-3 text-[12px] text-[#6B6B6B]">
              This permanently removes their login and profile. Type their 4-digit code below to confirm.
            </p>
            <label className="mb-1 mt-3 block text-[10px] font-bold uppercase">
              Type login code to confirm
            </label>
            <input
              className="brutal-input mb-4 text-center font-bold tracking-[0.35em]"
              placeholder={memberToDelete.pin_code || '0000'}
              inputMode="numeric"
              maxLength={4}
              value={deletePinConfirm}
              onChange={(event) =>
                setDeletePinConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))
              }
              autoComplete="off"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="brutal-btn bg-white py-2 text-[11px]"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="brutal-btn bg-danger py-2 text-[11px] text-white disabled:opacity-50"
                onClick={handleDeleteMember}
                disabled={!deletePinMatches || deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav role="admin" />
    </div>
  )
}
