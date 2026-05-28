import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle,
  ClipboardList,
  PackageCheck,
  QrCode,
  Truck,
  X,
} from 'lucide-react'
import { format, formatDistanceToNowStrict, isToday, parseISO } from 'date-fns'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import LaundryLoadCard from '../components/LaundryLoadCard'
import NewLoadModal from '../components/NewLoadModal'
import AdminTodoSummary from '../components/AdminTodoSummary'
import AdminLinenCount from '../components/AdminLinenCount'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'
import {
  getActiveShiftNote,
  getActiveLaundryLoads,
  getLocations,
  getNextPickupDate,
  getRecentLogEntries,
  getStaffActivityToday,
  getStorageRooms,
  getTasksForToday,
  getUncountedShelves,
  updateTask,
  updateLaundryLoadStatus,
} from '../lib/queries'

const statusOrder = { in_progress: 0, pending: 1, complete: 2 }

const taskStatusCycle = {
  pending: 'in_progress',
  in_progress: 'complete',
  complete: 'pending',
}

const ROOM_DISPLAY_ORDER = [
  'Mailroom linen',
  'Joe west linen',
  'CVA OHG',
  'P1 Storage',
  'SVP',
]

const sortRoomsByDisplayOrder = (rooms) =>
  [...(Array.isArray(rooms) ? rooms : [])].sort((a, b) => {
    const aIndex = ROOM_DISPLAY_ORDER.indexOf(a.name)
    const bIndex = ROOM_DISPLAY_ORDER.indexOf(b.name)
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
const normalizeRole = (role) => String(role || '').trim().toLowerCase()

export default function Dashboard() {
  const { user, profile } = useAuth()
  const isAdmin = normalizeRole(profile?.role) === 'admin'

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="min-h-screen bg-cream pb-20 pt-14">
        {isAdmin ? (
          <AdminDashboard user={user} profile={profile} />
        ) : (
          <StaffDashboard user={user} profile={profile} />
        )}
      </main>
      <BottomNav role={isAdmin ? 'admin' : 'staff'} />
    </div>
  )
}

function StaffDashboard({ user, profile }) {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState('')

  const [pickup, setPickup] = useState(null)
  const [pickupError, setPickupError] = useState('')
  const [shiftNote, setShiftNote] = useState(null)
  const [dismissedNote, setDismissedNote] = useState(false)

  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [tasksError, setTasksError] = useState('')

  const [laundryLoads, setLaundryLoads] = useState([])
  const [laundryLoading, setLaundryLoading] = useState(true)
  const [laundryError, setLaundryError] = useState('')
  const [showNewLoadModal, setShowNewLoadModal] = useState(false)
  const [recentActivity, setRecentActivity] = useState([])
  const [showTasksDrawer, setShowTasksDrawer] = useState(false)
  const [qrRoom, setQrRoom] = useState(null)

  const refetchRooms = async (showLoading = true) => {
    try {
      if (showLoading) setRoomsLoading(true)
      setRoomsError('')
      const data = await getStorageRooms()
      setRooms(data)
    } catch (error) {
      try {
        const fallbackLocations = await getLocations()
        const rows = fallbackLocations.filter((room) => room.mode === 'full')
        setRooms(
          rows.map((room) => ({
            ...room,
            total_bundles: 0,
            last_count_time: null,
            last_count_staff: null,
            item_breakdown: [],
          })),
        )
        setRoomsError('')
      } catch (_fallbackError) {
        setRoomsError(error.message)
      }
    } finally {
      if (showLoading) setRoomsLoading(false)
    }
  }

  const refetchTasks = async () => {
    try {
      setTasksLoading(true)
      setTasksError('')
      const data = await getTasksForToday()
      setTasks(data)
    } catch (error) {
      setTasksError(error.message)
    } finally {
      setTasksLoading(false)
    }
  }

  const refetchLaundry = async () => {
    try {
      setLaundryLoading(true)
      setLaundryError('')
      setLaundryLoads(await getActiveLaundryLoads())
    } catch (error) {
      setLaundryError(error.message)
    } finally {
      setLaundryLoading(false)
    }
  }

  const fetchStaticPanels = async () => {
    try {
      setPickupError('')
      const [shift, nextPickup, activity] = await Promise.all([
        getActiveShiftNote(),
        getNextPickupDate(),
        getRecentLogEntries(user.id, 8),
      ])
      setShiftNote(shift)
      setPickup(nextPickup)
      setRecentActivity(activity)
    } catch (error) {
      setPickupError(error.message)
    }
  }

  useEffect(() => {
    refetchRooms(true)
    refetchTasks()
    refetchLaundry()
    fetchStaticPanels()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refetchTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances' }, () =>
        refetchRooms(false),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_loads' }, refetchLaundry)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status]
        }
        return new Date(a.created_at) - new Date(b.created_at)
      }),
    [tasks],
  )
  const inProgressTasks = useMemo(
    () => sortedTasks.filter((task) => task.status === 'in_progress'),
    [sortedTasks],
  )
  const completeTasks = useMemo(
    () => sortedTasks.filter((task) => task.status === 'complete'),
    [sortedTasks],
  )
  const pendingTasks = useMemo(
    () => sortedTasks.filter((task) => task.status !== 'in_progress' && task.status !== 'complete'),
    [sortedTasks],
  )

  const updateTaskStatus = async (task) => {
    const nextStatus = taskStatusCycle[task.status] || 'pending'
    setTasks((current) =>
      current.map((row) => (row.id === task.id ? { ...row, status: nextStatus } : row)),
    )
    try {
      await updateTask(task.id, { status: nextStatus })
    } catch (error) {
      setTasks((current) => current.map((row) => (row.id === task.id ? task : row)))
      toast.error(error.message)
    }
  }

  useEffect(() => {
    if (!showTasksDrawer) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowTasksDrawer(false)
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showTasksDrawer])

  return (
    <section className="mx-auto w-full max-w-[720px] px-4 py-5 sm:px-6 md:px-8">
      <GreetingHeader
        profile={profile}
        onOpenTasks={() => navigate('/staff-todos')}
        totalTaskCount={sortedTasks.length}
        doneTaskCount={completeTasks.length}
      />

      {!dismissedNote && shiftNote ? (
        <div className="mb-4 flex items-start justify-between gap-3 border-[2.5px] border-ink bg-amber px-4 py-3 shadow-brutal">
          <div className="flex gap-3">
            <span className="text-[11px] font-extrabold uppercase">Handoff ↓</span>
            <p className="text-[14px] font-medium">{shiftNote.body}</p>
          </div>
          <button type="button" onClick={() => setDismissedNote(true)}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      <PickupBanner pickup={pickup} pickupError={pickupError} onRetry={fetchStaticPanels} />

      <SectionTitle title="Quick Actions" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <QuickAction icon={ClipboardList} label="Start Count" onClick={() => navigate('/inventory')} />
        <QuickAction icon={Truck} label="Log Pickup" onClick={() => setShowNewLoadModal(true)} />
        <QuickAction icon={PackageCheck} label="Mark Return" onClick={() => navigate('/laundry')} />
      </div>

      <LabeledSection label="Storage Rooms">
        {roomsError ? (
          <ErrorBlock message={roomsError} onRetry={() => refetchRooms(true)} />
        ) : roomsLoading ? (
          <StorageSkeleton />
        ) : !rooms.length ? (
          <EmptyState message="No storage rooms found. Re-run schema.sql seed data." />
        ) : (
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
            {sortRoomsByDisplayOrder(rooms).map((room) => (
              <StorageCard
                key={room.id}
                room={room}
                onShowQr={() => setQrRoom(room)}
                className="min-w-[272px] snap-start sm:min-w-[340px]"
              />
            ))}
          </div>
        )}
      </LabeledSection>

      <section className="mb-6">
        <LaundryLoadsPanel
          loads={laundryLoads}
          loading={laundryLoading}
          error={laundryError}
          onRetry={refetchLaundry}
          onNewLoad={() => setShowNewLoadModal(true)}
          onComplete={async (id) => {
            const previous = laundryLoads
            setLaundryLoads((current) => current.filter((load) => load.id !== id))
            try {
              await updateLaundryLoadStatus(id, 'complete')
            } catch (error) {
              setLaundryLoads(previous)
              toast.error(error.message || 'Failed to mark load complete')
            }
          }}
        />
      </section>

      <LabeledSection label="Recent Activity">
        <div>
          {recentActivity.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 border-b-[1.5px] border-stone py-2.5">
              <span className="mono text-[11px] text-[#6B6B6B]">
                {formatDistanceToNowStrict(parseISO(entry.created_at), { addSuffix: true })}
              </span>
              <span
                className={`stamp ${entry.action_type?.includes('restock')
                    ? 'stamp-blue'
                    : entry.action_type?.includes('pull')
                      ? 'stamp-amber'
                      : 'stamp-ink'
                  }`}
              >
                {entry.action_type || 'audit'}
              </span>
              <p className="text-[13px] font-semibold">{entry.items?.label || entry.items?.name || 'Item'}</p>
              <p className="mono text-[13px] font-bold">{entry.quantity}</p>
              <p className="text-[12px] text-[#6B6B6B]">{entry.locations?.name}</p>
            </div>
          ))}
          <p className="mt-2 text-right text-[12px] font-bold uppercase text-primary">View all →</p>
        </div>
      </LabeledSection>

      {qrRoom ? <QRModal room={qrRoom} onClose={() => setQrRoom(null)} /> : null}
      <NewLoadModal
        isOpen={showNewLoadModal}
        onClose={() => setShowNewLoadModal(false)}
        onLoadCreated={refetchLaundry}
        activeMachineNumbers={laundryLoads.map((load) => load.machine_number)}
        storageRoomOptions={sortRoomsByDisplayOrder(rooms).map((room) => room.name)}
        creatorName={profile?.full_name || 'Staff'}
        userId={user?.id}
      />
      <TasksDrawer
        open={showTasksDrawer}
        onClose={() => setShowTasksDrawer(false)}
        tasksError={tasksError}
        tasksLoading={tasksLoading}
        onRetry={refetchTasks}
        pendingTasks={pendingTasks}
        inProgressTasks={inProgressTasks}
        completeTasks={completeTasks}
        onCycleTask={updateTaskStatus}
      />
    </section>
  )
}

function AdminDashboard({ user, profile }) {
  const navigate = useNavigate()
  const [shiftNote, setShiftNote] = useState(null)
  const [pickup, setPickup] = useState(null)
  const [pickupError, setPickupError] = useState('')
  const [error, setError] = useState('')

  const loadAdminPanels = async () => {
    try {
      setError('')
      setPickupError('')
      const [shiftData, pickupData] = await Promise.all([
        getActiveShiftNote(),
        getNextPickupDate(),
      ])
      setShiftNote(shiftData)
      setPickup(pickupData)
    } catch (loadError) {
      setError(loadError.message)
      setPickupError(loadError.message)
    }
  }

  useEffect(() => {
    loadAdminPanels()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-panels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_notes' }, loadAdminPanels)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_schedule' }, loadAdminPanels)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  return (
    <section className="mx-auto w-full max-w-[1024px] px-4 py-5 sm:px-6 md:px-8">
      <div className="mb-6 border-b-[3px] border-ink pb-4 sm:flex sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin Dashboard</p>
          <h2 className="text-[28px] font-extrabold">{profile?.full_name || 'Admin'}</h2>
        </div>
        <div className="mt-2 text-left sm:mt-0 sm:text-right">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">{format(new Date(), 'EEEE')}</p>
          <p className="mono text-[16px] font-bold">{format(new Date(), 'dd MMM yyyy').toUpperCase()}</p>
        </div>
      </div>

      {shiftNote ? (
        <div className="mb-4 flex items-start gap-3 border-[2.5px] border-ink bg-amber px-4 py-3 shadow-brutal">
          <span className="text-[11px] font-extrabold uppercase">Handoff ↓</span>
          <p className="text-[14px] font-medium">{shiftNote.body}</p>
        </div>
      ) : null}

      <PickupBanner pickup={pickup} pickupError={pickupError} onRetry={loadAdminPanels} />

      <AdminTodoSummary onOpenDetail={() => navigate('/admin-todos')} />
      <AdminLinenCount />

      {error ? <ErrorBlock message={error} onRetry={loadAdminPanels} /> : null}
    </section>
  )
}

function GreetingHeader({ profile, onOpenTasks, totalTaskCount, doneTaskCount }) {
  return (
    <div className="mb-6 border-b-[3px] border-ink pb-4 sm:flex sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Good Morning,</p>
        <h2 className="text-[28px] font-extrabold">{profile?.full_name || 'Staff'}</h2>
      </div>
      <div className="mt-2 text-left sm:mt-0 sm:text-right">
        <button
          type="button"
          onClick={onOpenTasks}
          className="brutal-btn flex items-center gap-1.5 bg-white px-2.5 py-1 text-[10px] font-extrabold text-primary sm:ml-auto"
        >
          <ClipboardList size={13} />
          Today&apos;s Tasks
          <span className="mono rounded-sm bg-primary px-1.5 py-0.5 text-[9px] text-white">
            {doneTaskCount}/{totalTaskCount}
          </span>
        </button>
      </div>
    </div>
  )
}

function PickupBanner({ pickup, pickupError, onRetry }) {
  if (pickupError) return <ErrorBlock message={pickupError} onRetry={onRetry} />
  const nextDate = pickup?.pickup_date ? parseISO(pickup.pickup_date) : null
  const eventTitle = parseEventTitle(pickup?.notes)
  const daysDiff = nextDate ? Math.round((nextDate - new Date()) / (1000 * 60 * 60 * 24)) : null
  const isUrgent = daysDiff !== null && daysDiff <= 2
  const todayPickup = nextDate && isToday(nextDate)
  const bg = todayPickup ? 'bg-primary-light' : isUrgent ? 'bg-amber-light' : 'bg-white'
  const stampClass = todayPickup ? 'stamp-blue' : isUrgent ? 'stamp-amber' : 'stamp-gray'
  const stampText = todayPickup ? 'Today !' : daysDiff === 1 ? 'Tomorrow' : `In ${Math.max(daysDiff || 0, 0)} days`

  return (
    <div className={`mb-5 flex items-center gap-3 border-[2.5px] border-ink px-4 py-3 shadow-brutal ${bg}`}>
      <CalendarDays size={20} />
      <p className="text-[11px] font-extrabold uppercase">Next Event:</p>
      <p className="mono text-[15px] font-bold">
        {eventTitle ? eventTitle.toUpperCase() : nextDate ? format(nextDate, 'EEEE, MMMM d').toUpperCase() : 'NO EVENT SCHEDULED'}
      </p>
      <span className={`stamp ml-auto ${stampClass}`}>{stampText}</span>
    </div>
  )
}

function parseEventTitle(notes) {
  if (!notes) return ''
  if (typeof notes === 'string' && notes.startsWith('LT_EVENT:')) {
    try {
      const parsed = JSON.parse(notes.slice('LT_EVENT:'.length))
      return String(parsed?.title || '').trim()
    } catch (_error) {
      return ''
    }
  }
  return ''
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="brutal-card brutal-btn flex flex-col items-center bg-white px-2 py-4 text-center"
    >
      <Icon size={24} className="mb-2" />
      <span className="text-[11px] font-bold uppercase">{label}</span>
    </button>
  )
}

function StorageCard({ room, onShowQr, admin = false, infoOnly = false, className = '' }) {
  const status =
    room.total_bundles <= room.critical_threshold
      ? { label: 'CRITICAL', className: 'stamp-red' }
      : room.total_bundles <= room.low_threshold
        ? { label: 'LOW', className: 'stamp-amber' }
        : { label: 'GOOD', className: 'stamp-blue' }

  const notCountedToday = !room.last_count_time || !isToday(parseISO(room.last_count_time))
  return (
    <div className={`brutal-card overflow-hidden bg-white p-4 ${className}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[14px] font-extrabold uppercase">{room.name}</p>
        <span className={`stamp ${status.className}`}>{status.label}</span>
      </div>
      <p className="mono text-[44px] font-bold leading-none">{room.total_bundles}</p>
      <p className="mb-3 text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">Bundles</p>
      <div className="mb-2 border-t-[1.5px] border-stone bg-cream px-2.5 py-1.5">
        <p className="mono truncate text-[11px]">
          {room.item_breakdown?.length
            ? room.item_breakdown.map((item) => `${item.label.toUpperCase()} ${item.quantity}`).join(' · ')
            : 'NO COUNT DATA'}
        </p>
      </div>
      {infoOnly ? null : (
        <div className="mt-2 flex gap-2">
          <button className="brutal-btn flex-1 bg-primary px-2 py-2.5 text-[12px] text-white">Count Now →</button>
          <button
            type="button"
            onClick={onShowQr}
            className="brutal-card flex h-10 w-10 items-center justify-center bg-white"
          >
            <QrCode size={18} />
          </button>
        </div>
      )}
      {admin && !infoOnly ? <p className="mt-2 text-[11px] font-bold uppercase text-primary">View details →</p> : null}
      <p className="mono mt-2 text-[10px] uppercase text-[#6B6B6B]">
        {notCountedToday
          ? '⚠ NOT COUNTED TODAY'
          : `LAST COUNT: ${formatDistanceToNowStrict(parseISO(room.last_count_time), {
            addSuffix: true,
          }).toUpperCase()} · ${(room.last_count_staff || 'STAFF').toUpperCase()}`}
      </p>
    </div>
  )
}

function LaundryLoadsPanel({ loads, loading, error, onRetry, onNewLoad, onComplete, readOnly = false }) {
  const activeCount = loads.length
  const countBadgeClass =
    activeCount === 0
      ? 'stamp-blue'
      : activeCount >= SETTINGS.laundry.maxConcurrentLoads
        ? 'stamp-red'
        : 'stamp-amber'

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
          Laundry Loads
        </div>
        <div className="flex items-center gap-2">
          <span className={`stamp ${countBadgeClass} mono`}>{activeCount} ACTIVE</span>
          {!readOnly ? (
            <button
              type="button"
              onClick={onNewLoad}
              className="brutal-btn bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase text-primary"
            >
              + New Load
            </button>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBlock message={error} onRetry={onRetry} /> : null}

      {loading ? (
        <LaundryLoadsSkeleton />
      ) : (
        <div>
          {activeCount >= SETTINGS.laundry.maxConcurrentLoads ? (
            <div className="mb-3">
              <span className="stamp stamp-red">ALL MACHINES IN USE</span>
            </div>
          ) : null}

          {!loads.length ? (
            <div className="mb-2 flex items-center gap-2 border-[2.5px] border-ink bg-primary-light px-4 py-3">
              <CheckCircle size={20} className="text-primary" />
              <div>
                <p className="text-[14px] font-extrabold uppercase">NO ACTIVE LOADS</p>
                <p className="text-[12px] text-[#6B6B6B]">All machines are free</p>
              </div>
            </div>
          ) : (
            loads.map((load) => (
              <LaundryLoadCard key={load.id} load={load} onComplete={onComplete} showCompleteAction={!readOnly} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TasksDrawer({
  open,
  onClose,
  tasksError,
  tasksLoading,
  onRetry,
  pendingTasks,
  inProgressTasks,
  completeTasks,
  onCycleTask,
}) {
  const panelStateClass = open ? 'translate-x-0' : 'translate-x-full'
  const overlayStateClass = open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'

  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-200 ${overlayStateClass}`}>
      <button type="button" className="absolute inset-0 bg-ink/45" onClick={onClose} aria-label="Close tasks panel" />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-[430px] border-l-[2.5px] border-ink bg-cream shadow-[-6px_0_0_#001A57] transition-transform duration-250 ${panelStateClass}`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b-[2.5px] border-ink bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">{format(new Date(), 'EEEE')}</p>
                <h3 className="text-[18px] font-extrabold uppercase">Today&apos;s Tasks</h3>
              </div>
              <button type="button" className="brutal-btn bg-white px-2 py-1 text-[10px]" onClick={onClose}>
                Close ✕
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="stamp stamp-amber">{inProgressTasks.length} ON GOING</span>
              <span className="stamp stamp-blue">{completeTasks.length} COMPLETED</span>
              <span className="stamp stamp-gray">{pendingTasks.length} NOT STARTED</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {tasksError ? <ErrorBlock message={tasksError} onRetry={onRetry} /> : null}

            {tasksLoading ? (
              <TaskSkeleton />
            ) : (
              <div className="space-y-4">
                <TaskGroup
                  title="On Going"
                  count={inProgressTasks.length}
                  emptyLabel="No tasks on going."
                  tasks={inProgressTasks}
                  onCycleTask={onCycleTask}
                />
                <TaskGroup
                  title="Not Started"
                  count={pendingTasks.length}
                  emptyLabel="No not started tasks."
                  tasks={pendingTasks}
                  onCycleTask={onCycleTask}
                />
                <TaskGroup
                  title="Completed"
                  count={completeTasks.length}
                  emptyLabel="No completed tasks yet."
                  tasks={completeTasks}
                  onCycleTask={onCycleTask}
                />
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function TaskGroup({ title, count, emptyLabel, tasks, onCycleTask, readOnly = false }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.07em]">{title}</p>
        <span className="mono text-[11px] text-[#6B6B6B]">{count}</span>
      </div>
      {tasks.length ? (
        tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            readOnly={readOnly}
            onCycleStatus={onCycleTask ? () => onCycleTask(task) : undefined}
          />
        ))
      ) : (
        <div className="brutal-card bg-white px-3 py-2.5 text-[12px] text-[#6B6B6B]">{emptyLabel}</div>
      )}
    </section>
  )
}

function TaskRow({ task, onCycleStatus, readOnly = false }) {
  const border =
    task.is_priority ? 'border-l-amber' : task.status === 'in_progress' ? 'border-l-primary' : task.status === 'complete' ? 'border-l-stone' : 'border-l-ink'

  return (
    <div className={`mb-2 flex items-center gap-3 border-2 border-ink border-l-4 ${border} bg-white px-3.5 py-3 shadow-brutal-sm`}>
      {readOnly ? (
        <span
          className={`stamp ${task.status === 'complete'
              ? 'stamp-blue'
              : task.status === 'in_progress'
                ? 'stamp-amber'
                : 'stamp-gray'
            }`}
        >
          {task.status === 'complete' ? 'Completed' : task.status === 'in_progress' ? 'Ongoing' : 'Not Done'}
        </span>
      ) : (
        <button
          type="button"
          onClick={onCycleStatus}
          className={`h-7 w-7 border-2 border-ink ${task.status === 'complete'
              ? 'bg-ink text-white'
              : task.status === 'in_progress'
                ? 'bg-[linear-gradient(to_right,#001A57_50%,#FFFFFF_50%)]'
                : 'bg-white'
            }`}
        >
          {task.status === 'complete' ? <Check size={14} className="mx-auto" /> : null}
        </button>
      )}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-[14px] font-semibold ${task.status === 'complete' ? 'opacity-50 line-through' : ''}`}>
            {task.title}
          </p>
          {task.is_priority ? <span className="stamp stamp-amber">Priority</span> : null}
        </div>
        {task.details ? <p className="text-[12px] text-[#6B6B6B]">{task.details}</p> : null}
      </div>
    </div>
  )
}

function QRModal({ room, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card w-full max-w-[320px] bg-white p-8 text-center">
        <p className="mb-3 text-[18px] font-extrabold">{room.name.toUpperCase()}</p>
        <div className="mx-auto mb-3 w-fit border-2 border-ink p-2">
          <QRCodeSVG value={`${window.location.origin}/inventory?room=${room.id}`} size={180} />
        </div>
        <p className="text-[12px] text-[#6B6B6B]">Scan to count this room</p>
        <button type="button" onClick={onClose} className="brutal-btn mt-4 w-full bg-white py-2.5 text-[12px]">
          Close ✗
        </button>
      </div>
    </div>
  )
}

function LinenBreakdownModal({ total, byRoom, byItem, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card w-full max-w-[680px] bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Overall Linen</p>
            <p className="mono text-[34px] font-bold">{total}</p>
          </div>
          <button type="button" onClick={onClose} className="brutal-btn bg-white px-3 py-1.5 text-[11px]">
            Close ✕
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em]">By Room</p>
            <div className="max-h-[320px] overflow-y-auto">
              {byRoom.length ? (
                byRoom.map((room) => (
                  <div key={room.id} className="mb-1.5 flex items-center justify-between border-2 border-ink bg-cream px-3 py-2">
                    <p className="text-[12px] font-semibold">{room.name}</p>
                    <p className="mono text-[12px] font-bold">{room.total}</p>
                  </div>
                ))
              ) : (
                <div className="brutal-card bg-cream px-3 py-2 text-[12px] text-[#6B6B6B]">No room totals yet.</div>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em]">By Item Type</p>
            <div className="max-h-[320px] overflow-y-auto">
              {byItem.length ? (
                byItem.map((item) => (
                  <div key={item.label} className="mb-1.5 flex items-center justify-between border-2 border-ink bg-cream px-3 py-2">
                    <p className="text-[12px] font-semibold">{item.label}</p>
                    <p className="mono text-[12px] font-bold">{item.quantity}</p>
                  </div>
                ))
              ) : (
                <div className="brutal-card bg-cream px-3 py-2 text-[12px] text-[#6B6B6B]">No item breakdown yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorBlock({ message, onRetry }) {
  return (
    <div className="brutal-card mb-3 border-danger bg-danger-light p-3">
      <span className="stamp stamp-red mb-2">ERROR</span>
      <p className="mb-2 text-[13px]">{message}</p>
      <button type="button" className="brutal-btn bg-primary px-3 py-2 text-[11px] text-white" onClick={onRetry}>
        Retry →
      </button>
    </div>
  )
}

function EmptyState({ message }) {
  return <div className="brutal-card bg-white p-4 text-[13px] font-semibold">{message}</div>
}

function SectionTitle({ title }) {
  return (
    <div className="mb-3 inline-block border-b-2 border-ink">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em]">{title}</p>
    </div>
  )
}

function LabeledSection({ label, children }) {
  return (
    <section className="mb-6">
      <div className="mb-3 inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
        {label}
      </div>
      {children}
    </section>
  )
}

function Metric({ value, label, valueClass = 'text-white' }) {
  return (
    <div className="flex items-center">
      <div className="px-6 first:pl-0">
        <p className={`mono text-[28px] font-bold ${valueClass}`}>{value}</p>
        <p className="text-[9px] uppercase tracking-[0.08em] text-white/60">{label}</p>
      </div>
      <div className="h-10 w-px bg-white/30 last:hidden" />
    </div>
  )
}

function StorageSkeleton() {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      {[1, 2, 3].map((row) => (
        <div key={row} className="brutal-card min-w-[272px] snap-start bg-white p-4 sm:min-w-[340px]">
          <div className="skeleton mb-3 h-4 w-28" />
          <div className="skeleton mb-2 h-11 w-20" />
          <div className="skeleton mb-3 h-3 w-14" />
          <div className="skeleton h-8 w-full" />
        </div>
      ))}
    </div>
  )
}

function LaundryLoadsSkeleton() {
  return (
    <div>
      {[1, 2].map((row) => (
        <div key={row} className="brutal-card mb-2.5 bg-white p-4">
          <div className="skeleton mb-3 h-5 w-44" />
          <div className="skeleton mb-2 h-3 w-full" />
          <div className="skeleton h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

function TaskSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((row) => (
        <div key={row} className="brutal-card skeleton mb-2 h-16 bg-white" />
      ))}
    </div>
  )
}

function MetricSkeleton() {
  return (
    <div className="flex min-w-[760px] items-center gap-4">
      {[1, 2, 3, 4, 5, 6].map((block) => (
        <div key={block} className="flex-1">
          <div className="skeleton mb-2 h-8 w-14 bg-white/40" />
          <div className="skeleton h-2 w-20 bg-white/30" />
        </div>
      ))}
    </div>
  )
}
