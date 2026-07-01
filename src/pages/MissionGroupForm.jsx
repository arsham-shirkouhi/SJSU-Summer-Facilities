import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { SkeletonBlock } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { SETTINGS } from '../config/settings'
import {
  getActivePickupMission,
  getPickupMissionGroup,
  savePickupMissionGroup,
  startPickupMission,
} from '../lib/queries'

const MISSION_ITEMS = SETTINGS.missionItems

const EMPTY_COUNTS = MISSION_ITEMS.reduce(
  (state, item) => ({ ...state, [item.key]: '' }),
  { name: '' },
)

export default function MissionGroupForm() {
  const { groupId } = useParams()
  const isEdit = Boolean(groupId)
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const navRole = String(profile?.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'staff'

  const [missionId, setMissionId] = useState(null)
  const [form, setForm] = useState(EMPTY_COUNTS)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        let mission = await getActivePickupMission()

        if (!mission) {
          mission = await startPickupMission(user?.id)
        }

        setMissionId(mission.id)

        if (isEdit) {
          const group = await getPickupMissionGroup(groupId)
          if (!group || group.mission_id !== mission.id) {
            toast.error('Group not found in active mission')
            navigate('/mission', { replace: true })
            return
          }
          setForm({
            name: group.name,
            face_towels: String(group.face_towels ?? ''),
            body_towels: String(group.body_towels ?? ''),
            top_sheets: String(group.top_sheets ?? ''),
            pillow_cases: String(group.pillow_cases ?? ''),
          })
        }
      } catch (error) {
        toast.error(error.message || 'Failed to load group form')
        navigate('/mission', { replace: true })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [groupId, isEdit, navigate, user?.id])

  if (!user) return <Navigate to="/login" replace />

  const updateCount = (key, value) => {
    const digits = value.replace(/\D/g, '').slice(0, 5)
    setForm((state) => ({ ...state, [key]: digits }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const name = String(form.name || '').trim()
    if (!name) {
      toast.error('Group name is required')
      return
    }
    if (!missionId) {
      toast.error('No active mission')
      return
    }

    try {
      setSubmitting(true)
      await savePickupMissionGroup({
        missionId,
        groupId: isEdit ? groupId : null,
        name,
        faceTowels: form.face_towels,
        bodyTowels: form.body_towels,
        topSheets: form.top_sheets,
        pillowCases: form.pillow_cases,
        userId: user.id,
      })
      toast.success(isEdit ? 'Group updated' : 'Group saved')
      navigate('/mission')
    } catch (error) {
      toast.error(error.message || 'Failed to save group')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[720px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-6 border-b-[3px] border-ink pb-4">
          <Link to="/mission" className="mb-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase text-primary">
            <ArrowLeft size={14} />
            Back to Mission
          </Link>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Weekly Pickup</p>
          <h2 className="text-[28px] font-extrabold">{isEdit ? 'Edit Group' : 'Add Group'}</h2>
        </div>

        {loading ? (
          <div>
            <SkeletonBlock className="mb-3 h-12 w-full" />
            <SkeletonBlock className="mb-3 h-12 w-full" />
            <SkeletonBlock className="h-12 w-full" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="brutal-card bg-white p-5">
            <label className="mb-1 block text-[10px] font-bold uppercase">Group Name</label>
            <input
              className="brutal-input mb-4"
              placeholder="e.g. CVA Team A"
              value={form.name}
              onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))}
              required
            />

            <p className="mb-2 text-[10px] font-bold uppercase">Item Counts</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {MISSION_ITEMS.map((item) => (
                <div key={item.key}>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-[#6B6B6B]">
                    {item.label}
                  </label>
                  <input
                    className="brutal-input text-center font-bold"
                    inputMode="numeric"
                    placeholder="0"
                    value={form[item.key]}
                    onChange={(event) => updateCount(item.key, event.target.value)}
                  />
                </div>
              ))}
            </div>

            <button
              type="submit"
              className="brutal-btn mt-5 w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes →' : 'Save Group →'}
            </button>
          </form>
        )}
      </main>
      <BottomNav role={navRole} />
    </div>
  )
}
