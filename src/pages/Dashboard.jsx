import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  CheckCircle,
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
import AdminLinenCount from '../components/AdminLinenCount'
import EventDetailModal from '../components/EventDetailModal'
import {
  SkeletonBlock,
  SkeletonLaundryCard,
  SkeletonStorageCard,
} from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'
import {
  getActiveShiftNote,
  getActiveLaundryLoads,
  getLocations,
  getNextPickupEvents,
  getStorageRooms,
  updateLaundryLoadStatus,
} from '../lib/queries'
import { formatEventScheduleLabel, getEventColor, parseEventNotes } from '../lib/eventNotes'

const ROOM_DISPLAY_ORDER = [
  'Mailroom Storage',
  'Joe west linen',
  'OGH',
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
          <AdminDashboard profile={profile} />
        ) : (
          <StaffDashboard user={user} profile={profile} />
        )}
      </main>
      <BottomNav role={isAdmin ? 'admin' : 'staff'} />
    </div>
  )
}

function StaffDashboard({ user, profile }) {
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roomsError, setRoomsError] = useState('')

  const [nextEvents, setNextEvents] = useState({ date: null, events: [] })
  const [pickupError, setPickupError] = useState('')
  const [shiftNote, setShiftNote] = useState(null)
  const [dismissedNote, setDismissedNote] = useState(false)

  const [laundryLoads, setLaundryLoads] = useState([])
  const [laundryLoading, setLaundryLoading] = useState(true)
  const [laundryError, setLaundryError] = useState('')
  const [showNewLoadModal, setShowNewLoadModal] = useState(false)
  const [qrRoom, setQrRoom] = useState(null)
  const roomsRefetchTimerRef = useRef(null)

  const refetchRooms = async (showLoading = true, forceFresh = false) => {
    try {
      if (showLoading) setRoomsLoading(true)
      setRoomsError('')
      const data = await getStorageRooms(forceFresh ? { fresh: true } : {})
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
      const [shift, pickupData] = await Promise.all([
        getActiveShiftNote(),
        getNextPickupEvents(),
      ])
      setShiftNote(shift)
      setNextEvents(pickupData)
    } catch (error) {
      setPickupError(error.message)
    }
  }

  useEffect(() => {
    refetchRooms(true, true)
    refetchLaundry()
    fetchStaticPanels()
  }, [])

  useEffect(() => {
    const scheduleRoomsRefetch = () => {
      if (roomsRefetchTimerRef.current) clearTimeout(roomsRefetchTimerRef.current)
      roomsRefetchTimerRef.current = setTimeout(() => refetchRooms(false, true), 500)
    }

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances' }, scheduleRoomsRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_loads' }, refetchLaundry)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_schedule' }, fetchStaticPanels)
      .subscribe()

    return () => {
      if (roomsRefetchTimerRef.current) clearTimeout(roomsRefetchTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <section className="mx-auto w-full max-w-[1024px] px-4 py-5 sm:px-6 md:px-8">
      <GreetingHeader profile={profile} />

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

      <PickupBanner
        nextEvents={nextEvents}
        pickupError={pickupError}
        onRetry={fetchStaticPanels}
        viewSchedulePath="/events"
      />

      {/* Quick Actions — hidden for now
      <SectionTitle title="Quick Actions" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <QuickAction icon={ClipboardList} label="Start Count" onClick={() => navigate('/inventory')} />
        <QuickAction icon={Truck} label="Log Pickup" onClick={() => setShowNewLoadModal(true)} />
        <QuickAction icon={PackageCheck} label="Mark Return" onClick={() => navigate('/laundry')} />
      </div>
      */}

      <LabeledSection label="Storage Rooms">
        {roomsError ? (
          <ErrorBlock message={roomsError} onRetry={() => refetchRooms(true)} />
        ) : roomsLoading ? (
          <StorageSkeleton />
        ) : !rooms.length ? (
          <EmptyState message="No storage rooms found. Re-run schema.sql seed data." />
        ) : (
          <div className="staff-storage-grid grid grid-cols-3 gap-2">
            {sortRoomsByDisplayOrder(rooms).map((room) => (
              <StorageCard key={room.id} room={room} compact onShowQr={() => setQrRoom(room)} />
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
    </section>
  )
}

function AdminDashboard({ profile }) {
  const [shiftNote, setShiftNote] = useState(null)
  const [nextEvents, setNextEvents] = useState({ date: null, events: [] })
  const [pickupError, setPickupError] = useState('')
  const [error, setError] = useState('')

  const loadAdminPanels = async () => {
    try {
      setError('')
      setPickupError('')
      const [shiftData, pickupData] = await Promise.all([
        getActiveShiftNote(),
        getNextPickupEvents(),
      ])
      setShiftNote(shiftData)
      setNextEvents(pickupData)
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

      <PickupBanner
        nextEvents={nextEvents}
        pickupError={pickupError}
        onRetry={loadAdminPanels}
        viewSchedulePath="/admin-schedule"
      />

      <AdminLinenCount />

      {error ? <ErrorBlock message={error} onRetry={loadAdminPanels} /> : null}
    </section>
  )
}

function GreetingHeader({ profile }) {
  return (
    <div className="mb-6 border-b-[3px] border-ink pb-4 sm:flex sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Good Morning,</p>
        <h2 className="text-[28px] font-extrabold">{profile?.full_name || 'Staff'}</h2>
      </div>
      <div className="mt-2 text-left sm:mt-0 sm:text-right">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">{format(new Date(), 'EEEE')}</p>
        <p className="mono text-[16px] font-bold">{format(new Date(), 'dd MMM yyyy').toUpperCase()}</p>
      </div>
    </div>
  )
}

function PickupBanner({ nextEvents, pickupError, onRetry, viewSchedulePath }) {
  const [selectedEvent, setSelectedEvent] = useState(null)

  const openEventDetail = (event) => setSelectedEvent(event)
  const closeEventDetail = () => setSelectedEvent(null)

  if (pickupError) return <ErrorBlock message={pickupError} onRetry={onRetry} />

  const events = nextEvents?.events || []
  const nextDate = nextEvents?.date ? parseISO(nextEvents.date) : null
  const daysDiff = nextDate ? Math.round((nextDate - new Date()) / (1000 * 60 * 60 * 24)) : null
  const isUrgent = daysDiff !== null && daysDiff <= 2
  const todayPickup = nextDate && isToday(nextDate)
  const bg = todayPickup ? 'bg-primary-light' : isUrgent ? 'bg-amber-light' : 'bg-white'
  const stampClass = todayPickup ? 'stamp-blue' : isUrgent ? 'stamp-amber' : 'stamp-gray'
  const stampText = todayPickup ? 'Today !' : daysDiff === 1 ? 'Tomorrow' : `In ${Math.max(daysDiff || 0, 0)} days`
  const multiple = events.length > 1

  const detailModal = selectedEvent ? (
    <EventDetailModal
      date={nextDate}
      event={selectedEvent}
      onClose={closeEventDetail}
      viewSchedulePath={viewSchedulePath}
    />
  ) : null

  if (!nextDate || !events.length) {
    return (
      <div className="mb-5 flex items-center gap-3 border-[2.5px] border-ink bg-white px-4 py-3 shadow-brutal">
        <CalendarDays size={20} />
        <p className="text-[11px] font-extrabold uppercase">Next Event:</p>
        <p className="mono text-[15px] font-bold">NO EVENT SCHEDULED</p>
        <span className="stamp stamp-gray ml-auto">—</span>
      </div>
    )
  }

  if (multiple) {
    return (
      <>
        <div className={`mb-5 overflow-hidden border-[2.5px] border-ink shadow-brutal ${bg}`}>
          <div className="flex flex-wrap items-center gap-2 border-b-[1.5px] border-ink px-4 py-2.5">
            <CalendarDays size={20} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em]">Next Events</p>
              <p className="mono text-[13px] font-bold">{format(nextDate, 'EEEE, MMMM d').toUpperCase()}</p>
            </div>
            <span className="stamp stamp-ink">{events.length} EVENTS</span>
            <span className={`stamp ${stampClass}`}>{stampText}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
            {events.map((event, index) => {
              const parsed = parseEventNotes(event.notes)
              const color = getEventColor(parsed.color)
              const scheduleLabel = formatEventScheduleLabel(event, (value) =>
                format(parseISO(value), 'MMM d, yyyy'),
              )
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openEventDetail(event)}
                  className={`border-2 border-ink bg-white px-3 py-2.5 text-left shadow-[2px_2px_0_#001A57] transition-transform hover:-translate-y-0.5 ${
                    index === 0 ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                  style={{ borderLeftWidth: '5px', borderLeftColor: color.bg }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-extrabold uppercase">
                      {parsed.title || format(nextDate, 'MMM d').toUpperCase()}
                    </p>
                    {index === 0 ? <span className="stamp stamp-blue text-[8px]">Next Up</span> : null}
                  </div>
                  {scheduleLabel ? (
                    <p className="mono text-[11px] font-bold text-[#6B6B6B]">{scheduleLabel}</p>
                  ) : (
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">All day</p>
                  )}
                  {parsed.description ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-[#6B6B6B]">{parsed.description}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">View details →</p>
                </button>
              )
            })}
          </div>
        </div>
        {detailModal}
      </>
    )
  }

  const parsed = parseEventNotes(events[0]?.notes)
  const color = getEventColor(parsed.color)
  const scheduleLabel = formatEventScheduleLabel(events[0], (value) => format(parseISO(value), 'MMM d, yyyy'))
  const title = parsed.title || format(nextDate, 'EEEE, MMMM d')

  return (
    <>
      <button
        type="button"
        onClick={() => openEventDetail(events[0])}
        className={`mb-5 flex w-full flex-wrap items-center gap-3 border-[2.5px] border-ink px-4 py-3 text-left shadow-brutal transition-transform hover:-translate-y-0.5 ${bg}`}
        style={{ borderLeftWidth: '6px', borderLeftColor: color.bg }}
      >
        <CalendarDays size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase">Next Event:</p>
          <p className="mono text-[15px] font-bold">{title.toUpperCase()}</p>
          {scheduleLabel ? <p className="mono text-[11px] font-bold text-[#6B6B6B]">{scheduleLabel}</p> : null}
          {parsed.description ? (
            <p className="mt-1 line-clamp-2 text-[12px] text-[#6B6B6B]">{parsed.description}</p>
          ) : null}
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">View details →</p>
        </div>
        {!parsed.title ? (
          <p className="mono text-[13px] font-bold">{format(nextDate, 'EEEE, MMMM d').toUpperCase()}</p>
        ) : null}
        <span className={`stamp ml-auto ${stampClass}`}>{stampText}</span>
      </button>
      {detailModal}
    </>
  )
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

function StorageCard({ room, onShowQr, admin = false, infoOnly = false, compact = false, className = '' }) {
  const navigate = useNavigate()
  const openRoomInventory = () => {
    if (room?.id) navigate(`/inventory?room=${room.id}`)
  }

  const notCountedToday = !room.last_count_time || !isToday(parseISO(room.last_count_time))
  const lastCountLabel = notCountedToday
    ? 'Not counted today'
    : formatDistanceToNowStrict(parseISO(room.last_count_time), { addSuffix: true })

  if (compact) {
    return (
      <div className={`brutal-card flex min-w-0 flex-col bg-white p-2.5 sm:p-3 ${className}`}>
        <button
          type="button"
          onClick={openRoomInventory}
          className="mb-1 min-w-0 text-left text-[10px] font-extrabold uppercase leading-tight line-clamp-2 transition-colors hover:text-primary sm:text-[11px]"
        >
          {room.name}
        </button>
        <p className="mono text-[24px] font-bold leading-none sm:text-[28px]">{room.total_bundles}</p>
        <p className="text-[8px] uppercase tracking-[0.06em] text-[#6B6B6B] sm:text-[9px]">Items</p>
        {infoOnly ? null : (
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={openRoomInventory}
              className="brutal-btn min-w-0 flex-1 truncate bg-primary px-1.5 py-1.5 text-[9px] text-white sm:text-[10px]"
            >
              Count →
            </button>
            <button
              type="button"
              onClick={onShowQr}
              className="brutal-card flex h-8 w-8 shrink-0 items-center justify-center bg-white sm:h-9 sm:w-9"
              aria-label="Show QR code"
            >
              <QrCode size={14} />
            </button>
          </div>
        )}
        <p className="mt-1.5 min-w-0 text-[8px] uppercase leading-snug text-[#6B6B6B] line-clamp-2 sm:text-[9px]">
          {lastCountLabel}
        </p>
      </div>
    )
  }

  return (
    <div className={`brutal-card overflow-hidden bg-white p-4 ${className}`}>
      <div className="mb-2">
        <button
          type="button"
          onClick={openRoomInventory}
          className="text-left text-[14px] font-extrabold uppercase transition-colors hover:text-primary"
        >
          {room.name}
        </button>
      </div>
      <p className="mono text-[44px] font-bold leading-none">{room.total_bundles}</p>
      <p className="mb-3 text-[9px] uppercase tracking-[0.08em] text-[#6B6B6B]">Items</p>
      <div className="mb-2 border-t-[1.5px] border-stone bg-cream px-2.5 py-1.5">
        <p className="mono truncate text-[11px]">
          {room.item_breakdown?.length
            ? room.item_breakdown.map((item) => `${item.label.toUpperCase()} ${item.quantity}`).join(' · ')
            : 'NO COUNT DATA'}
        </p>
      </div>
      {infoOnly ? null : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={openRoomInventory}
            className="brutal-btn flex-1 bg-primary px-2 py-2.5 text-[12px] text-white"
          >
            Count Now →
          </button>
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
    <div className="staff-storage-grid grid grid-cols-3 gap-2">
      {[1, 2, 3, 4, 5, 6].map((row) => (
        <SkeletonStorageCard key={row} className="min-h-[132px]" />
      ))}
    </div>
  )
}

function LaundryLoadsSkeleton() {
  return (
    <div>
      {[1, 2].map((row) => (
        <SkeletonLaundryCard key={row} />
      ))}
    </div>
  )
}

function MetricSkeleton() {
  return (
    <div className="flex min-w-[760px] items-center gap-4">
      {[1, 2, 3, 4, 5, 6].map((block) => (
        <div key={block} className="flex-1">
          <SkeletonBlock dark className="mb-2 h-8 w-14" />
          <SkeletonBlock dark className="h-2 w-20" />
        </div>
      ))}
    </div>
  )
}
