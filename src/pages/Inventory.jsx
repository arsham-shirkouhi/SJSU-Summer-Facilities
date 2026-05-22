import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Package2 } from 'lucide-react'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { getLocations, getStorageRooms } from '../lib/queries'

const ROOM_ORDER = ['Mailroom linen', 'Joe west linen', 'CVA OHG', 'P1 Storage', 'SVP']

const orderedRooms = (rooms) =>
  [...rooms].sort((a, b) => {
    const aIndex = ROOM_ORDER.indexOf(a.name)
    const bIndex = ROOM_ORDER.indexOf(b.name)
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

const statOrder = ['Linen', 'Face/Hand Towel', 'Body Towel', 'Pillow Case']

export default function Inventory() {
  const { profile } = useAuth()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchRooms = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await getStorageRooms()
      setRooms(data)
    } catch (fetchError) {
      try {
        const locations = await getLocations()
        setRooms(
          locations
            .filter((room) => room.mode === 'full')
            .map((room) => ({
              ...room,
              total_bundles: 0,
              last_count_time: null,
              last_count_staff: null,
              item_breakdown: [],
            })),
        )
        setError('')
      } catch (_fallbackError) {
        setError(fetchError.message || 'Failed to load inventory.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const normalizedRooms = useMemo(() => {
    const mapped = orderedRooms(rooms).map((room) => {
      const byLabel = new Map((room.item_breakdown || []).map((item) => [item.label, item.quantity]))
      const stats = statOrder.map((label) => ({ label, quantity: Number(byLabel.get(label) || 0) }))
      const maxStat = Math.max(1, ...stats.map((stat) => stat.quantity))
      return { ...room, stats, maxStat }
    })

    // Ensure all 5 sections show even when some rooms are missing in data.
    return ROOM_ORDER.map((name) => mapped.find((room) => room.name === name) || buildEmptyRoom(name))
  }, [rooms])

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto w-full max-w-[1024px] px-4 pb-20 pt-20 sm:px-6 md:px-8">
        <header className="mb-5 border-b-[3px] border-ink pb-3">
          <div className="mb-1 flex items-center gap-2">
            <Package2 size={18} />
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
              Inventory Overview
            </p>
          </div>
          <h1 className="text-[30px] font-extrabold leading-tight">Storage Room Inventory</h1>
          <p className="text-[12px] uppercase tracking-[0.05em] text-[#6B6B6B]">
            5 Sections · Per-room linen/towel totals
          </p>
        </header>

        {error ? (
          <ErrorPanel message={error} onRetry={fetchRooms} />
        ) : loading ? (
          <InventorySkeleton />
        ) : (
          <div className="space-y-4">
            {normalizedRooms.map((room, index) => (
              <section key={room.name} className="brutal-card bg-white p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-stone pb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
                      Section {index + 1}
                    </p>
                    <h2 className="text-[22px] font-extrabold uppercase leading-tight">{room.name}</h2>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="mono text-[30px] font-bold leading-none">{room.total_bundles}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">
                      Total Pieces
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {room.stats.map((stat) => {
                    const width = `${Math.max(8, (stat.quantity / room.maxStat) * 100)}%`
                    return (
                      <div key={`${room.id || room.name}-${stat.label}`} className="border-2 border-ink p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.04em]">{stat.label}</p>
                          <p className="mono text-[18px] font-bold">{stat.quantity}</p>
                        </div>
                        <div className="h-2 w-full border border-ink bg-cream">
                          <div className="h-full bg-primary" style={{ width }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t-2 border-stone pt-2.5">
                  <span
                    className={`stamp ${
                      room.total_bundles <= room.critical_threshold
                        ? 'stamp-red'
                        : room.total_bundles <= room.low_threshold
                        ? 'stamp-amber'
                        : 'stamp-green'
                    }`}
                  >
                    {room.total_bundles <= room.critical_threshold
                      ? 'Critical'
                      : room.total_bundles <= room.low_threshold
                      ? 'Low'
                      : 'Good'}
                  </span>
                  <p className="text-[11px] text-[#6B6B6B]">
                    {room.last_count_time
                      ? `Last count ${formatDistanceToNowStrict(parseISO(room.last_count_time), {
                          addSuffix: true,
                        })} by ${room.last_count_staff || 'staff'}`
                      : 'No count log yet'}
                  </p>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <BottomNav role={profile?.role} />
    </div>
  )
}

function buildEmptyRoom(name) {
  return {
    id: name,
    name,
    low_threshold: 15,
    critical_threshold: 5,
    total_bundles: 0,
    last_count_time: null,
    last_count_staff: null,
    stats: statOrder.map((label) => ({ label, quantity: 0 })),
    maxStat: 1,
  }
}

function ErrorPanel({ message, onRetry }) {
  return (
    <div className="brutal-card border-danger bg-danger-light p-4">
      <div className="mb-2 flex items-center gap-2">
        <BarChart3 size={16} />
        <span className="stamp stamp-red">Error</span>
      </div>
      <p className="mb-3 text-[13px]">{message}</p>
      <button type="button" onClick={onRetry} className="brutal-btn bg-primary px-3 py-2 text-[11px] text-white">
        Retry →
      </button>
    </div>
  )
}

function InventorySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="brutal-card bg-white p-4 sm:p-5">
          <div className="skeleton mb-4 h-8 w-56" />
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {[1, 2, 3, 4].map((slot) => (
              <div key={slot} className="border-2 border-ink p-2.5">
                <div className="skeleton mb-2 h-5 w-40" />
                <div className="skeleton h-2 w-full" />
              </div>
            ))}
          </div>
          <div className="skeleton mt-3 h-5 w-48" />
        </div>
      ))}
    </div>
  )
}
