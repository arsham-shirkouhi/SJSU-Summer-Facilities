import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import RackVisual from './RackVisual'
import ShelfCountDrawer from './ShelfCountDrawer'
import { SkeletonBlock, SkeletonCard } from './Skeleton'
import { getRackUnitByCode } from '../lib/queries'

export default function RackCodeView({ rackCode, staffId, staffName, onBack }) {
  const [loading, setLoading] = useState(true)
  const [rackData, setRackData] = useState(null)
  const [selectedShelf, setSelectedShelf] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadRack = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getRackUnitByCode(rackCode)
      if (!data) {
        setRackData(null)
        toast.error('Rack code not found')
        return
      }
      setRackData(data)
    } catch (error) {
      setRackData(null)
      toast.error(error.message || 'Failed to load rack')
    } finally {
      setLoading(false)
    }
  }, [rackCode])

  useEffect(() => {
    loadRack()
  }, [loadRack])

  const handleSelectShelf = (shelf) => {
    setSelectedShelf(shelf)
    setDrawerOpen(true)
  }

  const handleShelfSaved = ({ shelfId, itemId, current_balance, updated_at }) => {
    setRackData((current) => {
      if (!current) return current
      return {
        ...current,
        shelves: current.shelves.map((shelf) =>
          shelf.id !== shelfId
            ? shelf
            : {
                ...shelf,
                rows: shelf.rows.map((row) =>
                  row.item_id === itemId ? { ...row, current_balance, updated_at } : row,
                ),
              },
        ),
      }
    })
    setSelectedShelf((current) => {
      if (!current || current.id !== shelfId) return current
      return {
        ...current,
        rows: current.rows.map((row) =>
          row.item_id === itemId ? { ...row, current_balance, updated_at } : row,
        ),
      }
    })
  }

  if (loading) {
    return (
      <div>
        <SkeletonCard className="mx-auto max-w-[420px] p-4">
          <SkeletonBlock className="mb-4 h-10 w-32" />
          <SkeletonBlock className="mb-3 h-48 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </SkeletonCard>
      </div>
    )
  }

  if (!rackData) {
    return (
      <div className="brutal-card bg-white p-4">
        <p className="text-[13px] font-semibold">No rack found for code {rackCode}.</p>
        <button type="button" className="brutal-btn mt-3 bg-white px-3 py-2 text-[11px]" onClick={onBack}>
          Back
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="brutal-btn mb-4 flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px]"
        onClick={onBack}
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <RackVisual
        rackUnit={{
          name: rackData.name,
          rack_code: rackData.rack_code || rackCode,
          roomName: rackData.roomName,
        }}
        shelves={rackData.shelves}
        selectedShelfId={selectedShelf?.id}
        onSelectShelf={handleSelectShelf}
      />

      <ShelfCountDrawer
        shelf={selectedShelf}
        roomId={rackData.roomId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        staffId={staffId}
        staffName={staffName}
        onSaved={handleShelfSaved}
      />
    </>
  )
}
