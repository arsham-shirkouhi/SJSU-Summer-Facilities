import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { SkeletonBlock } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { SETTINGS } from '../config/settings'
import {
  completePickupMission,
  createHistoricalPickupMission,
  deletePickupMission,
  deletePickupMissionGroup,
  getActivePickupMission,
  getPickupMissionHistory,
  startPickupMission,
  updatePickupMissionCompletedDate,
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
  const location = useLocation()
  const navRole = String(profile?.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'staff'
  const isAdmin = navRole === 'admin'

  const [mission, setMission] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [starting, setStarting] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)
  const [showAddHistory, setShowAddHistory] = useState(false)
  const [historyToDelete, setHistoryToDelete] = useState(null)
  const [deletingHistory, setDeletingHistory] = useState(false)
  const [historyToEditDate, setHistoryToEditDate] = useState(null)
  const [savingHistoryDate, setSavingHistoryDate] = useState(false)

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

  useEffect(() => {
    if (location.state?.showHistory) {
      setShowHistory(true)
      loadHistory()
    }
  }, [location.state?.showHistory])

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

  const handleDeleteHistory = async () => {
    if (!historyToDelete?.id) return
    try {
      setDeletingHistory(true)
      await deletePickupMission(historyToDelete.id)
      setHistory((current) => current.filter((entry) => entry.id !== historyToDelete.id))
      if (expandedHistoryId === historyToDelete.id) setExpandedHistoryId(null)
      setHistoryToDelete(null)
      toast.success('History entry deleted')
    } catch (error) {
      toast.error(error.message || 'Failed to delete history')
    } finally {
      setDeletingHistory(false)
    }
  }

  const handleSaveHistory = async ({ completedDate, groups }) => {
    await createHistoricalPickupMission({
      completedDate,
      groups,
      userId: user?.id,
    })
    await loadHistory()
    setShowAddHistory(false)
    toast.success('History entry added')
  }

  const handleSaveHistoryDate = async (completedDate) => {
    if (!historyToEditDate?.id) return
    try {
      setSavingHistoryDate(true)
      await updatePickupMissionCompletedDate(historyToEditDate.id, completedDate)
      await loadHistory()
      setHistoryToEditDate(null)
      toast.success('History date updated')
    } catch (error) {
      toast.error(error.message || 'Failed to update date')
    } finally {
      setSavingHistoryDate(false)
    }
  }

  const handleDeleteHistoryGroup = async (entryId, group) => {
    if (!window.confirm(`Remove group "${group.name}" from this history entry?`)) return
    try {
      await deletePickupMissionGroup(group.id)
      setHistory((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? { ...entry, groups: entry.groups.filter((row) => row.id !== group.id) }
            : entry,
        ),
      )
      toast.success('Group removed')
    } catch (error) {
      toast.error(error.message || 'Failed to remove group')
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
          <>
            {isAdmin ? (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  className="brutal-btn flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[11px] text-white"
                  onClick={() => setShowAddHistory(true)}
                >
                  <Plus size={14} />
                  Add History
                </button>
              </div>
            ) : null}
            <MissionHistory
              history={history}
              expandedHistoryId={expandedHistoryId}
              onToggle={(id) => setExpandedHistoryId((current) => (current === id ? null : id))}
              isAdmin={isAdmin}
              onDelete={setHistoryToDelete}
              onEditDate={setHistoryToEditDate}
              onDeleteGroup={handleDeleteHistoryGroup}
            />
          </>
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

      {showAddHistory ? (
        <AddHistoryModal onClose={() => setShowAddHistory(false)} onSubmit={handleSaveHistory} />
      ) : null}

      {historyToEditDate ? (
        <EditHistoryDateModal
          entry={historyToEditDate}
          onClose={() => setHistoryToEditDate(null)}
          onSubmit={handleSaveHistoryDate}
          saving={savingHistoryDate}
        />
      ) : null}

      {historyToDelete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-4">
          <div className="brutal-card w-full max-w-[520px] bg-white p-5">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Delete History</p>
            <h3 className="mt-1 text-[18px] font-extrabold uppercase">Remove This Week?</h3>
            <p className="mt-3 text-[13px] text-[#6B6B6B]">
              This permanently deletes the mission from{' '}
              {historyToDelete.completed_at
                ? format(new Date(historyToDelete.completed_at), 'MMM d, yyyy')
                : 'history'}{' '}
              and all {historyToDelete.groups?.length || 0} group(s) in it.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="brutal-btn bg-white py-2 text-[11px]"
                onClick={() => setHistoryToDelete(null)}
                disabled={deletingHistory}
              >
                Cancel
              </button>
              <button
                type="button"
                className="brutal-btn bg-danger py-2 text-[11px] text-white disabled:opacity-60"
                onClick={handleDeleteHistory}
                disabled={deletingHistory}
              >
                {deletingHistory ? 'Deleting...' : 'Delete →'}
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

function MissionHistory({ history, expandedHistoryId, onToggle, isAdmin, onDelete, onEditDate, onDeleteGroup }) {
  if (!history.length) {
    return (
      <div className="brutal-card bg-white p-5 text-[13px] text-[#6B6B6B]">
        No completed missions yet.
        {isAdmin ? ' Use Add History to log a past week.' : ''}
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
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onToggle(entry.id)}
              >
                <p className="text-[14px] font-extrabold uppercase">
                  Week of{' '}
                  {entry.completed_at
                    ? format(new Date(entry.completed_at), 'MMM d, yyyy')
                    : 'Unknown'}
                </p>
                <p className="mono mt-1 text-[11px] text-[#6B6B6B]">
                  {entry.groups?.length || 0} groups · {totalItems} items
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="brutal-btn bg-white px-2 py-1 text-[10px]"
                      onClick={() => onEditDate(entry)}
                      aria-label="Edit history date"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="brutal-btn bg-danger-light px-2 py-1 text-[10px]"
                      onClick={() => onDelete(entry)}
                      aria-label="Delete history entry"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                ) : null}
                <button type="button" onClick={() => onToggle(entry.id)} aria-label="Toggle details">
                  {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="mt-3 space-y-2 border-t border-stone pt-3">
                {isAdmin ? (
                  <div className="mb-2 flex justify-end">
                    <Link
                      to={`/mission/history/${entry.id}/groups/new`}
                      state={{ showHistory: true }}
                      className="brutal-btn flex items-center gap-1.5 bg-primary px-2.5 py-1 text-[10px] text-white"
                    >
                      <Plus size={12} />
                      Add Group
                    </Link>
                  </div>
                ) : null}
                {(entry.groups || []).length ? (
                  (entry.groups || []).map((group) => (
                    <div key={group.id} className="border-2 border-stone bg-cream px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold uppercase">{group.name}</p>
                          <p className="mono mt-1 text-[11px]">
                            {MISSION_ITEMS.map((item) => `${item.label}: ${group[item.key] || 0}`).join(' · ')}
                          </p>
                        </div>
                        {isAdmin ? (
                          <div className="flex shrink-0 gap-1">
                            <Link
                              to={`/mission/history/${entry.id}/groups/${group.id}/edit`}
                              state={{ showHistory: true }}
                              className="brutal-btn bg-white px-2 py-1 text-[10px]"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="brutal-btn bg-danger-light px-2 py-1 text-[10px]"
                              onClick={() => onDeleteGroup(entry.id, group)}
                              aria-label={`Delete ${group.name}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] text-[#6B6B6B]">
                    No groups yet.
                    {isAdmin ? ' Use Add Group to log one.' : ''}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

const EMPTY_HISTORY_GROUP = {
  name: '',
  face_towels: '',
  body_towels: '',
  top_sheets: '',
  pillow_cases: '',
}

function EditHistoryDateModal({ entry, onClose, onSubmit, saving }) {
  const [completedDate, setCompletedDate] = useState(() =>
    entry.completed_at ? format(new Date(entry.completed_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      await onSubmit(completedDate)
    } catch (error) {
      toast.error(error.message || 'Failed to update date')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card w-full max-w-[520px] bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
            <h3 className="text-[18px] font-extrabold uppercase">Edit History Date</h3>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-[10px] font-bold uppercase">Week Completed</label>
          <input
            type="date"
            className="brutal-input mb-4"
            value={completedDate}
            onChange={(event) => setCompletedDate(event.target.value)}
            required
          />
          <button
            type="submit"
            className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Date →'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AddHistoryModal({ onClose, onSubmit }) {
  const [completedDate, setCompletedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [groups, setGroups] = useState([{ ...EMPTY_HISTORY_GROUP }])
  const [submitting, setSubmitting] = useState(false)

  const updateGroup = (index, key, value) => {
    setGroups((current) =>
      current.map((group, groupIndex) =>
        groupIndex === index ? { ...group, [key]: value } : group,
      ),
    )
  }

  const addGroupRow = () => {
    setGroups((current) => [...current, { ...EMPTY_HISTORY_GROUP }])
  }

  const removeGroupRow = (index) => {
    setGroups((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      await onSubmit({ completedDate, groups })
    } catch (error) {
      toast.error(error.message || 'Failed to add history')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card max-h-[90vh] w-full max-w-[720px] overflow-y-auto bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
            <h3 className="text-[18px] font-extrabold uppercase">Add History Entry</h3>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-[10px] font-bold uppercase">Week Completed</label>
          <input
            type="date"
            className="brutal-input mb-4"
            value={completedDate}
            onChange={(event) => setCompletedDate(event.target.value)}
            required
          />

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase">Groups</p>
            <button type="button" className="brutal-btn bg-white px-2 py-1 text-[10px]" onClick={addGroupRow}>
              + Add Group
            </button>
          </div>

          <div className="space-y-3">
            {groups.map((group, index) => (
              <div key={`history-group-${index}`} className="border-2 border-stone bg-cream p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase">Group {index + 1}</p>
                  {groups.length > 1 ? (
                    <button
                      type="button"
                      className="text-[10px] font-bold uppercase text-danger"
                      onClick={() => removeGroupRow(index)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  className="brutal-input mb-2"
                  placeholder="Group name"
                  value={group.name}
                  onChange={(event) => updateGroup(index, 'name', event.target.value)}
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  {MISSION_ITEMS.map((item) => (
                    <div key={item.key}>
                      <label className="mb-1 block text-[9px] font-bold uppercase text-[#6B6B6B]">
                        {item.label}
                      </label>
                      <input
                        className="brutal-input text-center font-bold"
                        inputMode="numeric"
                        placeholder="0"
                        value={group[item.key]}
                        onChange={(event) =>
                          updateGroup(index, item.key, event.target.value.replace(/\D/g, '').slice(0, 5))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="brutal-btn mt-4 w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save to History →'}
          </button>
        </form>
      </div>
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
