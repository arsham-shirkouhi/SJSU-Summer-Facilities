import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ArrowUpRight, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'
import { getLinenCountByRoom, getStorageRooms } from '../lib/queries'

function normalizeRows(rows) {
  return (rows || []).reduce(
    (acc, row) => {
      const roomName = row?.locations?.name || row?.locations?.[0]?.name
      const itemLabel = row?.items?.label || row?.items?.[0]?.label
      const count = Number(row?.current_balance || 0)
      if (!roomName || !itemLabel) return acc
      if (!acc.rooms[roomName]) {
        acc.rooms[roomName] = { total: 0, latestUpdate: null }
      }
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
  const [storageRooms, setStorageRooms] = useState([])

  const refetch = async () => {
    try {
      setLoading(true)
      const [linenRows, rooms] = await Promise.all([getLinenCountByRoom(), getStorageRooms()])
      setRows(linenRows)
      setStorageRooms((rooms || []).map((room) => room.name).filter(Boolean))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel('admin-linen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances' }, refetch)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const normalized = useMemo(() => normalizeRows(rows), [rows])
  const roomNames = useMemo(() => {
    if (storageRooms.length) return storageRooms
    return SETTINGS.storageRooms || []
  }, [storageRooms])
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
          <button
            type="button"
            className="brutal-btn flex items-center gap-1.5 bg-amber px-3 py-1.5 text-[10px]"
            onClick={() => navigate('/admin-racks')}
          >
            <Layers size={13} />
            Manage Racks
          </button>
          <p className="mono text-[10px] text-[#6B6B6B]">{updatedText}</p>
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.max(roomNames.length, 5) }).map((_, idx) => (
            <div key={idx} className="brutal-card bg-white p-4">
              <div className="skeleton mb-2 h-5 w-32" />
              <div className="skeleton h-7 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {roomNames.map((roomName) => {
            const room = normalized.rooms[roomName] || { total: 0, latestUpdate: null }
            return (
              <div
                key={roomName}
                className="group brutal-card bg-white p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#001A57] active:translate-y-0.5 active:shadow-[2px_2px_0_#001A57]"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-[12px] font-extrabold uppercase">{roomName}</p>
                  <ArrowUpRight
                    size={16}
                    className="text-ink transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </div>
                <p className="mono text-[30px] font-bold">{room.total}</p>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Total Bundles</p>
                <div className="mt-2 border-t-[1.5px] border-[#E8E4DC] pt-2">
                  <p className="mono text-[11px] font-bold text-[#6B6B6B]">
                    LAST COUNT UPDATE:{' '}
                    {room.latestUpdate ? format(room.latestUpdate, 'MMM d, yyyy h:mm a') : 'NO UPDATE YET'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
