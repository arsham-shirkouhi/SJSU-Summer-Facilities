import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { getLinenCountByRoom, getStorageRooms } from '../lib/queries'
import { SkeletonLinenCountCard } from './Skeleton'

const ROOM_ORDER = ['Mailroom Storage', 'Joe west linen', 'OGH', 'P1 Storage', 'SVP']

const sortRooms = (rooms) =>
  [...(Array.isArray(rooms) ? rooms : [])].sort((a, b) => {
    const aIndex = ROOM_ORDER.indexOf(a.name)
    const bIndex = ROOM_ORDER.indexOf(b.name)
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

function normalizeRows(rows) {
  return (rows || []).reduce(
    (acc, row) => {
      const roomName = row?.location_name || row?.locations?.name || row?.locations?.[0]?.name
      const roomId = row?.location_id || row?.locations?.id || row?.locations?.[0]?.id
      const itemLabel = row?.item_label || row?.items?.label || row?.items?.[0]?.label
      const count = Number(row?.current_balance || 0)
      if (!roomName || !itemLabel) return acc
      if (!acc.rooms[roomName]) {
        acc.rooms[roomName] = { total: 0, latestUpdate: null, id: roomId || null }
      }
      if (roomId && !acc.rooms[roomName].id) acc.rooms[roomName].id = roomId
      acc.rooms[roomName][itemLabel] = (acc.rooms[roomName][itemLabel] || 0) + count
      acc.rooms[roomName].total += count

      const updated = row?.updated_at ? new Date(row.updated_at) : null
      if (updated && (!acc.latestUpdate || updated > acc.latestUpdate)) acc.latestUpdate = updated
      if (updated && (!acc.rooms[roomName].latestUpdate || updated > acc.rooms[roomName].latestUpdate)) {
        acc.rooms[roomName].latestUpdate = updated
      }
      return acc
    },
    { rooms: {}, latestUpdate: null },
  )
}

export default function AdminLinenCount() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [rooms, setRooms] = useState([])

  const refetch = async () => {
    try {
      setLoading(true)
      const [linenRows, storageRoomRows] = await Promise.all([
        getLinenCountByRoom(),
        getStorageRooms(),
      ])
      setRows(linenRows)
      setRooms(
        sortRooms(
          (storageRoomRows || []).map((room) => ({
            id: room.id,
            name: room.name,
          })),
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let debounceTimer = null
    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(refetch, 500)
    }

    refetch()
    const channel = supabase
      .channel('admin-linen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances' }, scheduleRefetch)
      .subscribe()
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [])

  const normalized = useMemo(() => normalizeRows(rows), [rows])
  const displayRooms = useMemo(() => {
    if (rooms.length) return rooms
    return sortRooms(
      Object.entries(normalized.rooms).map(([name, data]) => ({
        id: data.id,
        name,
      })),
    )
  }, [rooms, normalized.rooms])
  const updatedText = normalized.latestUpdate
    ? `UPDATED ${formatDistanceToNowStrict(normalized.latestUpdate, { addSuffix: true }).toUpperCase()}`
    : 'UPDATED JUST NOW'

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
          Linen Count
        </div>
        <div className="flex items-center gap-2">
          <p className="mono text-[10px] text-[#6B6B6B]">{updatedText}</p>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.max(displayRooms.length, 5) }).map((_, idx) => (
            <SkeletonLinenCountCard key={idx} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {displayRooms.map((room) => {
            const stats = normalized.rooms[room.name] || { total: 0, latestUpdate: null, id: null }
            const roomId = room.id || stats.id
            const openRoomInventory = () => {
              if (roomId) navigate(`/inventory?room=${roomId}`)
            }

            return (
              <button
                key={room.id || room.name}
                type="button"
                onClick={openRoomInventory}
                disabled={!roomId}
                className="group brutal-card w-full bg-white p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#001A57] active:translate-y-0.5 active:shadow-[2px_2px_0_#001A57] disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-[12px] font-extrabold uppercase transition-colors group-hover:text-primary">
                    {room.name}
                  </p>
                  <ArrowUpRight
                    size={16}
                    className="text-ink transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </div>
                <p className="mono text-[30px] font-bold">{stats.total}</p>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Total Items</p>
                <div className="mt-2 border-t-[1.5px] border-[#E8E4DC] pt-2">
                  <p className="mono text-[11px] font-bold text-[#6B6B6B]">
                    LAST COUNT UPDATE:{' '}
                    {stats.latestUpdate ? format(stats.latestUpdate, 'MMM d, yyyy h:mm a') : 'NO UPDATE YET'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
