import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { SkeletonBlock } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { SETTINGS } from '../config/settings'
import {
  completePickupMission,
  deletePickupMissionGroup,
  getActivePickupMission,
  getPickupMissionHistory,
  startPickupMission,
} from '../lib/queries'

const MISSION_ITEMS = SETTINGS.missionItems

function sumGroupCounts(group) {
  return MISSION_ITEMS.reduce((total, item) => total + (Number(group[item.key]) || 0), 0)
}

function sumMissionTotals(groups) {
  return MISSION_ITEMS.reduce(
    (totals, item) => ({
      ...totals,
      [item.key]: groups.reduce((sum, group) => sum + (Number(group[item.key]) || 0), 0),
    }),
    {},
  )
}

export default function Mission() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const navRole = String(profile?.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'staff'

  const [mission, setMission] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [starting, setStarting] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)

  const totals = useMemo(() => sumMissionTotals(mission?.groups || []), [mission?.groups])
  const grandTotal = useMemo(
    () => MISSION_ITEMS.reduce((sum, item) => sum + (totals[item.key] || 0), 0),
    [totals],
  )

  const loadMission = async () => {
    try {
      setLoading(true)
      const active = await getActivePickupMission()
      setMission(active)
    } catch (error) {
      toast.error(error.message || 'Failed to load mission')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    try {
      const rows = await getPickupMissionHistory()
      setHistory(rows)
    } catch (error) {
      toast.error(error.message || 'Failed to load history')
    }
  }

  useEffect(() => {
    loadMission()
    loadHistory()
  }, [])

  const handleStartMission = async () => {
    try {
      setStarting(true)
      const created = await startPickupMission(user?.id)
      setMission(created)
      toast.success('Weekly pickup started')
      navigate('/mission/groups/new')
    } catch (error) {
      toast.error(error.message || 'Failed to start pickup')
    } finally {
      setStarting(false)
    }
  }

  const handleDeleteGroup = async (group) => {
    if (!window.confirm(`Remove group "${group.name}"?`)) return
    try {
      await deletePickupMissionGroup(group.id)
      setMission((current) =>
        current
          ? { ...current, groups: current.groups.filter((row) => row.id !== group.id) }
          : current,
      )
      toast.success('Group removed')
    } catch (error) {
      toast.error(error.message || 'Failed to remove group')
    }
  }

  const handleCompleteMission = async () => {
    if (!mission?.id) return
    try {
      setCompleting(true)
      await completePickupMission(mission.id, user?.id)
      toast.success('Drop off & pick up saved to history')
      setMission(null)
      setConfirmComplete(false)
      await loadHistory()
      setShowHistory(true)
    } catch (error) {
      toast.error(error.message || 'Failed to complete mission')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1024px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-6 flex items-end justify-between gap-3 border-b-[3px] border-ink pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Weekly</p>
            <h2 className="text-[28px] font-extrabold">Mission</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowHistory((current) => !current)}
            className={`brutal-btn shrink-0 px-3 py-1.5 text-[11px] ${showHistory ? 'bg-ink text-white' : 'bg-white'}`}
          >
            {showHistory ? 'Active Mission' : 'History'}
          </button>
        </div>

        {showHistory ? (
          <MissionHistory
            history={history}
            expandedHistoryId={expandedHistoryId}
            onToggle={(id) => setExpandedHistoryId((current) => (current === id ? null : id))}
          />
        ) : loading ? (
          <MissionSkeleton />
        ) : !mission ? (
          <section className="brutal-card bg-white p-6 text-center">
            <ClipboardList size={36} className="mx-auto mb-3 text-primary" />
            <p className="text-[18px] font-extrabold uppercase">No Active Pickup</p>
            <p className="mx-auto mb-5 mt-2 max-w-[420px] text-[13px] text-[#6B6B6B]">
              Start a weekly drop-off and pick-up. Add groups as they bring dirty linen, then complete
              the mission when the week is done.
            </p>
            <button
              type="button"
              className="brutal-btn bg-primary px-5 py-2.5 text-[12px] text-white disabled:opacity-60"
              onClick={handleStartMission}
              disabled={starting}
            >
              {starting ? 'Starting...' : 'Start Weekly Pickup →'}
            </button>
          </section>
        ) : (
          <>
            <section className="mb-5 border-[2.5px] border-ink bg-primary px-4 py-4 text-white shadow-brutal">
              <p className="text-[10px] uppercase tracking-[0.08em] text-white/70">Active Since</p>
              <p className="mono text-[15px] font-bold">
                {mission.created_at ? format(new Date(mission.created_at), 'MMM d, yyyy h:mm a') : '--'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {MISSION_ITEMS.map((item) => (
                  <div key={item.key}>
                    <p className="mono text-[22px] font-bold">{totals[item.key] || 0}</p>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-white/70">{item.label}</p>
                  </div>
                ))}
                <div>
                  <p className="mono text-[22px] font-bold">{grandTotal}</p>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-white/70">Total Items</p>
                </div>
              </div>
            </section>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">
                Groups ({mission.groups?.length || 0})
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/mission/groups/new"
                  className="brutal-btn flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px] text-primary"
                >
                  <Plus size={14} />
                  Add Group
                </Link>
                <button
                  type="button"
                  className="brutal-btn bg-ink px-3 py-1.5 text-[11px] text-white"
                  onClick={() => setConfirmComplete(true)}
                >
                  Drop Off & Pick Up →
                </button>
              </div>
            </div>

            {!mission.groups?.length ? (
              <div className="brutal-card bg-white p-5 text-center">
                <p className="text-[14px] font-extrabold uppercase">No Groups Yet</p>
                <p className="mt-2 text-[12px] text-[#6B6B6B]">
                  Add a group for each team dropping off dirty linen this week.
                </p>
                <Link
                  to="/mission/groups/new"
                  className="brutal-btn mt-4 inline-block bg-primary px-4 py-2 text-[12px] text-white"
                >
                  Add First Group →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {mission.groups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onDelete={() => handleDeleteGroup(group)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {confirmComplete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-4">
          <div className="brutal-card w-full max-w-[520px] bg-white p-5">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Complete Mission</p>
            <h3 className="mt-1 text-[18px] font-extrabold uppercase">Drop Off & Pick Up</h3>
            <p className="mt-3 text-[13px] text-[#6B6B6B]">
              This saves {mission?.groups?.length || 0} group(s) ({grandTotal} items) to history and
              clears the active mission so you can start next week.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="brutal-btn bg-white py-2 text-[11px]"
                onClick={() => setConfirmComplete(false)}
                disabled={completing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="brutal-btn bg-primary py-2 text-[11px] text-white disabled:opacity-60"
                onClick={handleCompleteMission}
                disabled={completing}
              >
                {completing ? 'Saving...' : 'Confirm →'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav role={navRole} />
    </div>
  )
}

function GroupCard({ group, onDelete }) {
  const total = sumGroupCounts(group)

  return (
    <div className="brutal-card bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-extrabold uppercase">{group.name}</p>
          <p className="mono mt-1 text-[12px] font-bold text-primary">{total} items total</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Link
            to={`/mission/groups/${group.id}/edit`}
            className="brutal-btn bg-white px-2.5 py-1 text-[10px]"
          >
            Edit
          </Link>
          <button type="button" className="brutal-btn bg-danger-light px-2.5 py-1 text-[10px]" onClick={onDelete}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MISSION_ITEMS.map((item) => (
          <div key={item.key} className="border-2 border-stone bg-cream px-2.5 py-2">
            <p className="mono text-[16px] font-bold">{group[item.key] || 0}</p>
            <p className="text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MissionHistory({ history, expandedHistoryId, onToggle }) {
  if (!history.length) {
    return (
      <div className="brutal-card bg-white p-5 text-[13px] text-[#6B6B6B]">
        No completed missions yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((entry) => {
        const totalsForEntry = sumMissionTotals(entry.groups || [])
        const totalItems = MISSION_ITEMS.reduce((sum, item) => sum + (totalsForEntry[item.key] || 0), 0)
        const expanded = expandedHistoryId === entry.id

        return (
          <div key={entry.id} className="brutal-card bg-white p-4">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => onToggle(entry.id)}
            >
              <div>
                <p className="text-[14px] font-extrabold uppercase">
                  Week of{' '}
                  {entry.completed_at
                    ? format(new Date(entry.completed_at), 'MMM d, yyyy')
                    : 'Unknown'}
                </p>
                <p className="mono mt-1 text-[11px] text-[#6B6B6B]">
                  {entry.groups?.length || 0} groups · {totalItems} items
                </p>
              </div>
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {expanded ? (
              <div className="mt-3 space-y-2 border-t border-stone pt-3">
                {(entry.groups || []).map((group) => (
                  <div key={group.id} className="border-2 border-stone bg-cream px-3 py-2">
                    <p className="text-[12px] font-bold uppercase">{group.name}</p>
                    <p className="mono mt-1 text-[11px]">
                      {MISSION_ITEMS.map((item) => `${item.label}: ${group[item.key] || 0}`).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function MissionSkeleton() {
  return (
    <div>
      <SkeletonBlock className="mb-4 h-36 w-full" />
      <SkeletonBlock className="mb-2 h-24 w-full" />
      <SkeletonBlock className="h-24 w-full" />
    </div>
  )
}
