import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'
import { getLinenCountByRoom } from '../lib/queries'

function normalizeRows(rows) {
  return (rows || []).reduce(
    (acc, row) => {
      const roomName = row?.locations?.name || row?.locations?.[0]?.name
      const itemLabel = row?.items?.label || row?.items?.[0]?.label
      const count = Number(row?.current_balance || 0)
      if (!roomName || !itemLabel) return acc
      if (!acc.rooms[roomName]) {
        acc.rooms[roomName] = { total: 0 }
      }
      acc.rooms[roomName][itemLabel] = (acc.rooms[roomName][itemLabel] || 0) + count
      acc.rooms[roomName].total += count

      const updated = row?.updated_at ? new Date(row.updated_at) : null
      if (updated && (!acc.latestUpdate || updated > acc.latestUpdate)) acc.latestUpdate = updated
      return acc
    },
    { rooms: {}, latestUpdate: null },
  )
}

export default function AdminLinenCount() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = async () => {
    try {
      setLoading(true)
      setRows(await getLinenCountByRoom())
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
  const roomNames = SETTINGS.storageRooms || []
  const itemLabels = (SETTINGS.itemTypes || []).map((item) => item.label)
  const updatedText = normalized.latestUpdate
    ? `UPDATED ${formatDistanceToNowStrict(normalized.latestUpdate, { addSuffix: true }).toUpperCase()}`
    : 'UPDATED JUST NOW'

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
          Linen Count
        </div>
        <p className="mono text-[10px] text-[#6B6B6B]">{updatedText}</p>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: Math.max(roomNames.length, 3) }).map((_, idx) => (
            <div key={idx} className="brutal-card bg-white p-4">
              <div className="skeleton mb-2 h-5 w-32" />
              {Array.from({ length: itemLabels.length || 5 }).map((__, rowIdx) => (
                <div key={rowIdx} className="skeleton mb-1.5 h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roomNames.map((roomName) => {
            const room = normalized.rooms[roomName] || { total: 0 }
            return (
              <div key={roomName} className="brutal-card bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-[14px] font-extrabold uppercase">{roomName}</p>
                  <p className="mono text-[22px] font-bold">{room.total}</p>
                </div>
                <div className="mb-2 border-t-[1.5px] border-[#E8E4DC]" />
                <div>
                  {itemLabels.map((label) => (
                    <div key={label} className="flex items-center justify-between border-b border-[#F5F0E8] py-1.5">
                      <span className="text-[13px] font-medium">{label}</span>
                      <span className="mono text-[14px] font-bold">{Number(room[label] || 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t-2 border-ink pt-2">
                  <p className="mono text-[12px] font-bold uppercase">TOTAL: {room.total} BUNDLES</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
