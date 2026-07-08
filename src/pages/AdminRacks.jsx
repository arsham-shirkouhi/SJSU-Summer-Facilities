import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Navigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { getActiveRackItems, RackDeleteModal, RackFormModal } from '../components/RackSetupModals'
import { getRoomRackPrefix, getRackDisplayName } from '../lib/rackCodes'
import { useAuth } from '../context/AuthContext'
import {
  createRack,
  deleteRack,
  getAdminRoomRacks,
  getRackItems,
  getStorageRoomsWithRackCounts,
  updateRack,
} from '../lib/queries'
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton'

const ROOM_ORDER = ['Mailroom Storage', 'Joe west linen', 'OGH', 'P1 Storage', 'SVP']

const orderedRooms = (rooms) =>
  [...rooms].sort((a, b) => {
    const aIndex = ROOM_ORDER.indexOf(a.name)
    const bIndex = ROOM_ORDER.indexOf(b.name)
    if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

export default function AdminRacks() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const roomId = searchParams.get('room')

  const [rooms, setRooms] = useState([])
  const [racks, setRacks] = useState([])
  const [items, setItems] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [loadingRacks, setLoadingRacks] = useState(false)
  const [rackModal, setRackModal] = useState(null)
  const [confirmDeleteRack, setConfirmDeleteRack] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  if (normalizedRole !== 'admin') return <Navigate to="/dashboard" replace />

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === roomId) || null,
    [rooms, roomId],
  )

  const totalRacks = useMemo(
    () => rooms.reduce((sum, room) => sum + Number(room.rack_count || 0), 0),
    [rooms],
  )

  const loadRooms = async () => {
    try {
      setLoadingRooms(true)
      const [roomRows, itemRows] = await Promise.all([getStorageRoomsWithRackCounts(), getRackItems()])
      setRooms(roomRows || [])
      setItems(itemRows || [])
    } catch (error) {
      toast.error(error.message || 'Failed to load storage rooms')
    } finally {
      setLoadingRooms(false)
    }
  }

  const loadRacks = async () => {
    if (!roomId) {
      setRacks([])
      return
    }
    try {
      setLoadingRacks(true)
      const rows = await getAdminRoomRacks(roomId)
      setRacks(rows || [])
    } catch (error) {
      toast.error(error.message || 'Failed to load racks')
    } finally {
      setLoadingRacks(false)
    }
  }

  useEffect(() => {
    loadRooms()
  }, [])

  useEffect(() => {
    loadRacks()
  }, [roomId])

  const openRoom = (targetRoomId) => setSearchParams({ room: targetRoomId })
  const openRooms = () => setSearchParams({})

  const openCreateModal = () => {
    setRackModal({ mode: 'create', rack: null })
  }

  const openEditModal = (rack) => {
    const shelfConfigs = (rack.shelves || []).map((shelf) => ({
      shelfId: shelf.id,
      shelfLabel: shelf.shelf_label || shelf.name,
      itemIds: getActiveRackItems(shelf).map((entry) => entry.item_id),
    }))
    setRackModal({
      mode: 'edit',
      rack,
      initial: {
        rackCode: rack.rack_code || '',
        shelfCount: rack.shelves?.length || 1,
        itemIds: getActiveRackItems(rack).map((entry) => entry.item_id),
        shelfConfigs,
      },
    })
  }

  const closeModal = () => setRackModal(null)

  const handleSaveRack = async ({ shelfCount, itemIds, shelfConfigs }) => {
    if (!selectedRoom) return

    try {
      setSubmitting(true)
      if (rackModal?.mode === 'edit' && rackModal.rack?.id) {
        await updateRack({
          rackUnitId: rackModal.rack.id,
          shelfConfigs,
          itemIds: shelfConfigs ? undefined : itemIds,
        })
        toast.success('Rack updated')
      } else {
        const created = await createRack({
          locationId: selectedRoom.id,
          locationName: selectedRoom.name,
          shelfCount,
          itemIds,
        })
        toast.success(created?.rack_code ? `Rack added · code ${created.rack_code}` : 'Rack added')
      }
      closeModal()
      await Promise.all([loadRooms(), loadRacks()])
    } catch (error) {
      toast.error(error.message || 'Failed to save rack')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRack = async () => {
    if (!confirmDeleteRack?.id) return

    try {
      setDeleting(true)
      await deleteRack({ rackUnitId: confirmDeleteRack.id })
      toast.success('Rack deleted')
      setConfirmDeleteRack(null)
      await Promise.all([loadRooms(), loadRacks()])
    } catch (error) {
      toast.error(error.message || 'Failed to delete rack')
    } finally {
      setDeleting(false)
    }
  }

  if (!roomId) {
    return (
      <div className="min-h-screen bg-cream">
        <TopBar />
        <main className="mx-auto min-h-screen w-full max-w-[1024px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
          <div className="mb-4 flex items-start justify-between gap-3 border-b-[3px] border-ink pb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
              <h2 className="text-[24px] font-extrabold">Rack Setup</h2>
              <p className="text-[12px] uppercase tracking-[0.05em] text-[#6B6B6B]">
                Add racks and assign items for each storage room
              </p>
            </div>
            <div className="text-right">
              <p className="mono text-[24px] font-bold">{totalRacks}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Total Racks</p>
            </div>
          </div>

          {loadingRooms ? (
            <RoomSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {orderedRooms(rooms).map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => openRoom(room.id)}
                  className="brutal-card bg-white p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <p className="text-[15px] font-extrabold uppercase leading-tight">{room.name}</p>
                  <p className="mono mt-2 text-[34px] font-bold leading-none">{room.rack_count}</p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Racks Planned</p>
                  <p className="mt-2 text-[11px] font-bold uppercase text-primary">Manage Racks →</p>
                </button>
              ))}
            </div>
          )}
        </main>
        <BottomNav role="admin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1024px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-4 border-b-[3px] border-ink pb-3">
          <button
            type="button"
            className="brutal-btn mb-3 flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px]"
            onClick={openRooms}
          >
            <ArrowLeft size={14} />
            Back to Rooms
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Rack Setup</p>
              <h2 className="text-[24px] font-extrabold">{selectedRoom?.name || 'Room'}</h2>
              <p className="text-[12px] uppercase tracking-[0.05em] text-[#6B6B6B]">
                {racks.length} rack{racks.length === 1 ? '' : 's'} in this room
                {getRoomRackPrefix(selectedRoom?.name)
                  ? ` · auto codes ${getRoomRackPrefix(selectedRoom?.name)}01, ${getRoomRackPrefix(selectedRoom?.name)}02...`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              className="brutal-btn flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[11px] text-white disabled:opacity-60"
              onClick={openCreateModal}
              disabled={loadingRacks}
            >
              <Plus size={14} />
              Add Rack
            </button>
          </div>
        </div>

        {loadingRacks ? (
          <RackSkeleton />
        ) : !racks.length ? (
          <div className="brutal-card bg-white p-4">
            <p className="text-[13px] font-semibold">No racks yet for this room.</p>
            <p className="mt-1 text-[12px] text-[#6B6B6B]">
              Add racks with auto-assigned codes and assign items to each shelf.
            </p>
            <button
              type="button"
              className="brutal-btn mt-3 bg-amber px-3 py-2 text-[11px]"
              onClick={openCreateModal}
            >
              Add First Rack
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {racks.map((rack) => {
              const rackItems = getActiveRackItems(rack)
              return (
                <div key={rack.id} className="brutal-card bg-white p-4">
                  <div className="mb-2 flex items-start justify-between gap-2 border-b-2 border-stone pb-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack</p>
                      <h3 className="mono text-[20px] font-extrabold uppercase">{getRackDisplayName(rack)}</h3>
                      <p className="mt-1 text-[10px] font-semibold uppercase text-[#6B6B6B]">
                        {(rack.shelves || []).length} shelf{(rack.shelves || []).length === 1 ? '' : 'ves'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="brutal-btn flex items-center gap-1 bg-white px-2 py-1 text-[10px]"
                        onClick={() => openEditModal(rack)}
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="brutal-btn flex items-center gap-1 bg-danger-light px-2 py-1 text-[10px] text-ink"
                        onClick={() => setConfirmDeleteRack(rack)}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                      {rack.rack_code ? (
                        <span className="stamp stamp-ink">{rack.rack_code}</span>
                      ) : (
                        <span className="stamp stamp-gray">NO CODE</span>
                      )}
                    </div>
                  </div>
                  {rackItems.length ? (
                    <div className="flex flex-wrap gap-2">
                      {rackItems.map((entry) => (
                        <span key={entry.item_id} className="stamp stamp-blue">
                          {entry.items?.label || entry.items?.name || 'Item'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] text-[#6B6B6B]">No items assigned yet.</p>
                      <button
                        type="button"
                        className="text-[11px] font-bold uppercase text-primary"
                        onClick={() => openEditModal(rack)}
                      >
                        Assign Items →
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {rackModal ? (
        <RackFormModal
          mode={rackModal.mode}
          roomName={selectedRoom?.name}
          locationId={selectedRoom?.id}
          refreshKey={racks.length}
          items={items}
          initial={rackModal.initial}
          submitting={submitting}
          onClose={closeModal}
          onSubmit={handleSaveRack}
        />
      ) : null}

      <RackDeleteModal
        rack={confirmDeleteRack}
        deleting={deleting}
        onCancel={() => setConfirmDeleteRack(null)}
        onConfirm={handleDeleteRack}
      />

      <BottomNav role="admin" />
    </div>
  )
}

function RoomSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5].map((row) => (
        <SkeletonCard key={row} className="p-4">
          <SkeletonBlock className="mb-2 h-5 w-40" />
          <SkeletonBlock className="h-8 w-16" />
        </SkeletonCard>
      ))}
    </div>
  )
}

function RackSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((row) => (
        <SkeletonCard key={row} className="p-4">
          <SkeletonBlock className="mb-2 h-5 w-48" />
          <SkeletonBlock className="h-10 w-full" />
        </SkeletonCard>
      ))}
    </div>
  )
}
