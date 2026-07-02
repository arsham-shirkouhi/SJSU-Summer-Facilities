import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Camera,
  ChevronRight,
  Layers,
  Minus,
  Package2,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import TopBar from '../components/TopBar'
import {
  SkeletonBlock,
  SkeletonCard,
} from '../components/Skeleton'
import BottomNav from '../components/BottomNav'
import { getActiveRackItems, RackDeleteModal, RackFormModal } from '../components/RackSetupModals'
import { useAuth } from '../context/AuthContext'
import { SETTINGS } from '../config/settings'
import {
  adjustShelfItemCount,
  createRack,
  deleteRack,
  getAdminRoomRacks,
  getItems,
  getLocationById,
  getLocations,
  getShelvesByRoom,
  getStorageRooms,
  transferShelfItemCount,
  updateRack,
} from '../lib/queries'

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

export default function Inventory() {
  const { profile, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const roomId = searchParams.get('room')
  const shelfId = searchParams.get('shelf')

  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [roomDetail, setRoomDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [selectedIncrement, setSelectedIncrement] = useState(SETTINGS.inventory.countIncrements[1] || 1)
  const [submittingKey, setSubmittingKey] = useState('')
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [adminRacks, setAdminRacks] = useState([])
  const [rackItems, setRackItems] = useState([])
  const [loadingAdminRacks, setLoadingAdminRacks] = useState(false)
  const [rackModal, setRackModal] = useState(null)
  const [confirmDeleteRack, setConfirmDeleteRack] = useState(null)
  const [rackSubmitting, setRackSubmitting] = useState(false)
  const [rackDeleting, setRackDeleting] = useState(false)

  const manageRacksMode = searchParams.get('manage') === 'racks'

  const fetchRooms = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await getStorageRooms()
      setRooms(data || [])
    } catch (fetchError) {
      try {
        const locations = await getLocations()
        setRooms(
          (locations || []).filter((room) => room.mode === 'full').map((room) => ({
            ...room,
            total_bundles: 0,
            low_threshold: Number(room.low_threshold || 15),
            critical_threshold: Number(room.critical_threshold || 5),
          })),
        )
      } catch (_fallbackError) {
        setError(fetchError.message || 'Failed to load inventory rooms.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const fetchRoomDetail = async () => {
    if (!roomId) {
      setRoomDetail(null)
      setDetailError('')
      return
    }

    try {
      setDetailLoading(true)
      setDetailError('')
      const [room, shelves] = await Promise.all([
        getLocationById(roomId),
        getShelvesByRoom(roomId),
      ])

      if (!room) {
        setRoomDetail(null)
        setDetailError('Room not found.')
        return
      }

      const normalizedShelves = (shelves || []).map((shelf) => {
        const balanceByItemId = new Map(
          (shelf.balances || []).map((balance) => [
            balance.item_id,
            {
              id: balance.id,
              current_balance: Number(balance.current_balance || 0),
            },
          ]),
        )

        const configuredItems = (shelf.shelf_items || [])
          .filter((entry) => entry.is_active !== false)
          .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .map((entry) => ({
            item_id: entry.item_id,
            item_name: entry.items?.name || '',
            item_label: entry.items?.label || entry.items?.name || 'Item',
          }))

        const rows = configuredItems.map((item) => {
          const balance = balanceByItemId.get(item.item_id)
          return {
            ...item,
            current_balance: Number(balance?.current_balance || 0),
          }
        })

        return {
          id: shelf.id,
          name: shelf.name,
          rows,
        }
      })

      setRoomDetail({
        roomId: room.id,
        roomName: room.name,
        shelves: normalizedShelves,
      })
    } catch (loadError) {
      setRoomDetail(null)
      setDetailError(loadError.message || 'Failed to load room racks')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    fetchRoomDetail()
  }, [roomId])

  const loadAdminRacks = async () => {
    if (!roomId) {
      setAdminRacks([])
      return
    }
    try {
      setLoadingAdminRacks(true)
      const [racks, items] = await Promise.all([getAdminRoomRacks(roomId), getItems()])
      setAdminRacks(racks || [])
      setRackItems(items || [])
    } catch (loadError) {
      toast.error(loadError.message || 'Failed to load rack setup')
    } finally {
      setLoadingAdminRacks(false)
    }
  }

  useEffect(() => {
    if (manageRacksMode && roomId) {
      loadAdminRacks()
    } else {
      setAdminRacks([])
    }
  }, [manageRacksMode, roomId])

  const normalizedRooms = useMemo(() => orderedRooms(rooms), [rooms])

  const selectedShelf = useMemo(
    () => roomDetail?.shelves?.find((shelf) => shelf.id === shelfId) || null,
    [roomDetail, shelfId],
  )

  const adjustCount = async ({ shelf, row, change }) => {
    if (!roomDetail || !shelf || !row) return

    const actionKey = `${shelf.id}-${row.item_id}`
    setSubmittingKey(actionKey)
    try {
      const result = await adjustShelfItemCount({
        shelfId: shelf.id,
        locationId: roomDetail.roomId,
        itemId: row.item_id,
        delta: change,
        staffId: user?.id,
        staffName: profile?.full_name || user?.email || 'Staff',
        itemName: row.item_name,
        itemLabel: row.item_label,
      })

      if (!result.applied_delta) {
        toast.error('Nothing to remove. Count is already zero.')
      }

      setRoomDetail((current) => {
        if (!current) return current
        return {
          ...current,
          shelves: current.shelves.map((shelfEntry) =>
            shelfEntry.id !== shelf.id
              ? shelfEntry
              : {
                  ...shelfEntry,
                  rows: shelfEntry.rows.map((rowEntry) =>
                    rowEntry.item_id === row.item_id
                      ? { ...rowEntry, current_balance: result.current_balance }
                      : rowEntry,
                  ),
                },
          ),
        }
      })
    } catch (adjustError) {
      toast.error(adjustError.message || 'Failed to update tally')
    } finally {
      setSubmittingKey('')
    }
  }

  const openRooms = () => setSearchParams({})
  const openRoom = (targetRoomId) => setSearchParams({ room: targetRoomId })
  const openShelf = (targetRoomId, targetShelfId) => {
    setSearchParams({ room: targetRoomId, shelf: targetShelfId })
  }
  const setManageRacksMode = (enabled) => {
    if (!roomId) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (enabled) next.set('manage', 'racks')
      else next.delete('manage')
      return next
    })
  }

  useEffect(() => {
    if (!roomId && searchParams.get('manage') === 'racks') {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('manage')
        return next
      })
    }
  }, [roomId])

  const openCreateRackModal = () => {
    setRackModal({ mode: 'create', rack: null })
  }

  const openEditRackModal = (rack) => {
    const rackItemRows = getActiveRackItems(rack)
    setRackModal({
      mode: 'edit',
      rack,
      initial: {
        name: rack.name,
        itemIds: rackItemRows.map((entry) => entry.item_id),
      },
    })
  }

  const refreshRackViews = async () => {
    await Promise.all([fetchRoomDetail(), loadAdminRacks(), fetchRooms()])
  }

  const handleSaveRack = async ({ name, itemIds }) => {
    if (!roomDetail?.roomId) return

    try {
      setRackSubmitting(true)
      if (rackModal?.mode === 'edit' && rackModal.rack?.id) {
        await updateRack({
          shelfId: rackModal.rack.id,
          name: name.trim(),
          itemIds,
        })
        toast.success('Rack updated')
      } else {
        await createRack({
          locationId: roomDetail.roomId,
          locationName: roomDetail.roomName,
          name: name.trim(),
          itemIds,
        })
        toast.success('Rack added')
      }
      setRackModal(null)
      await refreshRackViews()
    } catch (saveError) {
      toast.error(saveError.message || 'Failed to save rack')
    } finally {
      setRackSubmitting(false)
    }
  }

  const handleDeleteRack = async () => {
    if (!confirmDeleteRack?.id) return

    try {
      setRackDeleting(true)
      await deleteRack({ shelfId: confirmDeleteRack.id })
      toast.success('Rack deleted')
      setConfirmDeleteRack(null)
      await refreshRackViews()
    } catch (deleteError) {
      toast.error(deleteError.message || 'Failed to delete rack')
    } finally {
      setRackDeleting(false)
    }
  }
  const handleQrDetected = (rawValue) => {
    const parsed = parseInventoryQr(rawValue)
    if (!parsed?.roomId) {
      toast.error('QR code is not a valid LinenTrack inventory link')
      return
    }
    setShowQrScanner(false)
    if (parsed.shelfId) {
      openShelf(parsed.roomId, parsed.shelfId)
      return
    }
    openRoom(parsed.roomId)
  }

  const renderHeader = (eyebrow, title, subtitle, backAction = null, backLabel = '', actions = null) => (
    <header className="mb-5 border-b-[3px] border-ink pb-3">
      {backAction ? (
        <button
          type="button"
          className="brutal-btn mb-3 flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px]"
          onClick={backAction}
        >
          <ArrowLeft size={14} />
          {backLabel}
        </button>
      ) : null}
      <div className="mb-1 flex items-center gap-2">
        <Package2 size={18} />
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">{eyebrow}</p>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] font-extrabold leading-tight">{title}</h1>
          <p className="text-[12px] uppercase tracking-[0.05em] text-[#6B6B6B]">{subtitle}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">{actions}</div> : null}
      </div>
    </header>
  )

  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  const isAdmin = normalizedRole === 'admin'

  const manageRacksButton = isAdmin ? (
    <button
      type="button"
      className={`brutal-btn flex items-center gap-1.5 px-3 py-1.5 text-[11px] ${
        manageRacksMode ? 'bg-ink text-white' : 'bg-white'
      }`}
      onClick={() => setManageRacksMode(!manageRacksMode)}
    >
      <Layers size={14} />
      {manageRacksMode ? 'Done Managing' : 'Manage Racks'}
    </button>
  ) : null

  const listHeaderActions = (
    <>
      <button
        type="button"
        className="brutal-btn flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px]"
        onClick={() => setShowQrScanner(true)}
      >
        <QrCode size={14} />
        Scan QR
      </button>
      <button
        type="button"
        className="brutal-btn flex items-center gap-1.5 bg-amber px-3 py-1.5 text-[11px]"
        onClick={() => setShowTransfer(true)}
      >
        <ArrowLeftRight size={14} />
        Transfer
      </button>
    </>
  )

  if (!roomId) {
    return (
      <div className="min-h-screen bg-cream">
        <TopBar />
        <main className="mx-auto w-full max-w-[1024px] px-4 pb-20 pt-20 sm:px-6 md:px-8">
          {renderHeader(
            'Inventory',
            'Storage Rooms',
            'Select a room to view racks',
            null,
            '',
            listHeaderActions,
          )}

          {error ? (
            <ErrorPanel message={error} onRetry={fetchRooms} />
          ) : loading ? (
            <InventorySkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {normalizedRooms.map((room) => {
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => openRoom(room.id)}
                    className="brutal-card bg-white p-4 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-[15px] font-extrabold uppercase leading-tight">{room.name}</p>
                    </div>
                    <p className="mono text-[36px] font-bold leading-none">{Number(room.total_bundles || 0)}</p>
                    <p className="mb-3 text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Total Bundles</p>
                    <div className="flex items-center justify-end text-[11px] font-bold uppercase text-primary">
                      Open Room
                      <ChevronRight size={14} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </main>
        {showQrScanner ? (
          <QrScannerModal onClose={() => setShowQrScanner(false)} onDetected={handleQrDetected} />
        ) : null}
        {showTransfer ? (
          <TransferModal
            rooms={normalizedRooms}
            staffId={user?.id}
            staffName={profile?.full_name || user?.email || 'Staff'}
            onClose={() => setShowTransfer(false)}
            onSuccess={() => {
              setShowTransfer(false)
              fetchRooms()
              toast.success('Transfer completed')
            }}
          />
        ) : null}
        <BottomNav role={profile?.role} />
      </div>
    )
  }

  if (roomId && !shelfId) {
    const roomRackHeaderActions = isAdmin ? (
      <>
        {manageRacksMode ? (
          <button
            type="button"
            className="brutal-btn flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[11px] text-white"
            onClick={openCreateRackModal}
          >
            <Plus size={14} />
            Add Rack
          </button>
        ) : null}
        {manageRacksButton}
      </>
    ) : null

    return (
      <div className="min-h-screen bg-cream">
        <TopBar />
        <main className="mx-auto w-full max-w-[1024px] px-4 pb-20 pt-20 sm:px-6 md:px-8">
          {renderHeader(
            manageRacksMode ? 'Rack Setup' : 'Room Racks',
            roomDetail?.roomName || 'Room',
            manageRacksMode ? 'Add racks and assign linen items' : 'Select a rack to start count',
            openRooms,
            'Back to Rooms',
            roomRackHeaderActions,
          )}

          {manageRacksMode ? (
            loadingAdminRacks || detailLoading ? (
              <InventorySkeleton />
            ) : !adminRacks.length ? (
              <div className="brutal-card bg-white p-4">
                <p className="text-[13px] font-semibold">No racks yet for this room.</p>
                <p className="mt-1 text-[12px] text-[#6B6B6B]">
                  Add a rack name and choose which linen items belong on it.
                </p>
                <button
                  type="button"
                  className="brutal-btn mt-3 bg-amber px-3 py-2 text-[11px]"
                  onClick={openCreateRackModal}
                >
                  Add First Rack
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {adminRacks.map((rack) => {
                  const rackItemRows = getActiveRackItems(rack)
                  return (
                    <div key={rack.id} className="brutal-card bg-white p-4">
                      <div className="mb-2 flex items-start justify-between gap-2 border-b-2 border-stone pb-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack</p>
                          <h3 className="text-[18px] font-extrabold uppercase">{rack.name}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="brutal-btn flex items-center gap-1 bg-white px-2 py-1 text-[10px]"
                            onClick={() => openEditRackModal(rack)}
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
                        </div>
                      </div>
                      {rackItemRows.length ? (
                        <div className="flex flex-wrap gap-2">
                          {rackItemRows.map((entry) => (
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
                            onClick={() => openEditRackModal(rack)}
                          >
                            Assign Items →
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : detailError ? (
            <ErrorPanel message={detailError} onRetry={fetchRoomDetail} />
          ) : detailLoading ? (
            <InventorySkeleton />
          ) : !roomDetail?.shelves?.length ? (
            <div className="brutal-card bg-white p-4">
              <p className="text-[13px] font-semibold">No racks yet for this room.</p>
              <p className="mt-1 text-[12px] text-[#6B6B6B]">
                {isAdmin ? 'Turn on Manage Racks to add racks to this room.' : 'Ask an admin to set up racks for this room.'}
              </p>
              {isAdmin ? (
                <button
                  type="button"
                  className="brutal-btn mt-3 bg-amber px-3 py-2 text-[11px]"
                  onClick={() => setManageRacksMode(true)}
                >
                  Manage Racks
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {roomDetail.shelves.map((shelf) => {
                const total = shelf.rows.reduce((sum, row) => sum + Number(row.current_balance || 0), 0)
                return (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => openShelf(roomId, shelf.id)}
                    className="brutal-card bg-white p-4 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack</p>
                    <h2 className="text-[22px] font-extrabold uppercase leading-tight">{shelf.name}</h2>
                    <p className="mono mt-1 text-[24px] font-bold">{total}</p>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Total Count</p>
                    <div className="mt-2 flex items-center justify-end text-[11px] font-bold uppercase text-primary">
                      Start Count
                      <ChevronRight size={14} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </main>

        {rackModal ? (
          <RackFormModal
            mode={rackModal.mode}
            roomName={roomDetail?.roomName}
            items={rackItems}
            initial={rackModal.initial}
            submitting={rackSubmitting}
            onClose={() => setRackModal(null)}
            onSubmit={handleSaveRack}
          />
        ) : null}

        <RackDeleteModal
          rack={confirmDeleteRack}
          deleting={rackDeleting}
          onCancel={() => setConfirmDeleteRack(null)}
          onConfirm={handleDeleteRack}
        />

        <BottomNav role={profile?.role} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto w-full max-w-[1024px] px-4 pb-20 pt-20 sm:px-6 md:px-8">
        {renderHeader(
          'Rack Counter',
          `${roomDetail?.roomName || 'Room'} · ${selectedShelf?.name || 'Rack'}`,
          'Choose increment, then add/remove bundles',
          () => openRoom(roomId),
          'Back to Racks',
        )}

        <section className="mb-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em]">Count Increment</p>
          <div className="flex flex-wrap gap-2">
            {SETTINGS.inventory.countIncrements.map((increment) => (
              <button
                key={increment}
                type="button"
                onClick={() => setSelectedIncrement(increment)}
                className={`brutal-btn px-3 py-1.5 text-[11px] ${
                  selectedIncrement === increment ? 'bg-primary text-white' : 'bg-white'
                }`}
              >
                {increment}
              </button>
            ))}
          </div>
        </section>

        {detailError ? (
          <ErrorPanel message={detailError} onRetry={fetchRoomDetail} />
        ) : detailLoading ? (
          <InventorySkeleton />
        ) : !selectedShelf ? (
          <div className="brutal-card bg-white p-4">
            <p className="text-[13px] font-semibold">Rack not found.</p>
          </div>
        ) : (
          <section className="brutal-card bg-white p-4 sm:p-5">
            <div className="mb-3 border-b-2 border-stone pb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack</p>
              <h2 className="text-[20px] font-extrabold uppercase">{selectedShelf.name}</h2>
            </div>

            <div className="space-y-2">
              {!selectedShelf.rows.length ? (
                <p className="text-[12px] text-[#6B6B6B]">
                  No items assigned to this rack yet. An admin can assign items with Manage Racks.
                </p>
              ) : null}
              {selectedShelf.rows.map((row) => {
                const rowKey = `${selectedShelf.id}-${row.item_id}`
                const pending = submittingKey === rowKey
                return (
                  <div key={rowKey} className="border-2 border-ink bg-cream p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[12px] font-bold uppercase">{row.item_label}</p>
                      <p className="mono text-[20px] font-bold">{row.current_balance}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        className="brutal-btn flex items-center justify-center gap-1 bg-white px-2 py-2 text-[11px]"
                        onClick={() => adjustCount({ shelf: selectedShelf, row, change: -selectedIncrement })}
                      >
                        <Minus size={12} />
                        Remove {selectedIncrement}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="brutal-btn flex items-center justify-center gap-1 bg-primary px-2 py-2 text-[11px] text-white"
                        onClick={() => adjustCount({ shelf: selectedShelf, row, change: selectedIncrement })}
                      >
                        <Plus size={12} />
                        Add {selectedIncrement}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
      <BottomNav role={profile?.role} />
    </div>
  )
}

function parseInventoryQr(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    const roomId = parsed.searchParams.get('room')
    const shelfId = parsed.searchParams.get('shelf')
    if (!roomId) return null
    return { roomId, shelfId: shelfId || null }
  } catch (_error) {
    try {
      const parsed = new URL(value, window.location.origin)
      const roomId = parsed.searchParams.get('room')
      const shelfId = parsed.searchParams.get('shelf')
      if (!roomId) return null
      return { roomId, shelfId: shelfId || null }
    } catch (_nestedError) {
      return null
    }
  }
}

function QrScannerModal({ onClose, onDetected }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const [manualValue, setManualValue] = useState('')
  const [scannerReady, setScannerReady] = useState(false)

  useEffect(() => {
    let active = true
    let loopTimer = null
    let detector = null

    const cleanup = () => {
      if (loopTimer) clearTimeout(loopTimer)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }

    const loopDetect = async () => {
      if (!active) return
      const video = videoRef.current
      if (video && detector && video.readyState >= 2) {
        try {
          const results = await detector.detect(video)
          if (results?.length && results[0]?.rawValue) {
            onDetected(results[0].rawValue)
            return
          }
        } catch (_detectError) {
          // Keep scanning even if one detect frame fails.
        }
      }
      loopTimer = setTimeout(loopDetect, 280)
    }

    const start = async () => {
      if (!('BarcodeDetector' in window)) {
        setError('Camera QR scan is not supported in this browser. Paste QR link below.')
        return
      }
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setScannerReady(true)
        }
        loopDetect()
      } catch (_error) {
        setError('Unable to access camera. Check permissions or paste the QR link below.')
      }
    }

    start()
    return () => {
      active = false
      cleanup()
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 px-4">
      <div className="brutal-card w-full max-w-[560px] bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Inventory</p>
            <p className="text-[18px] font-extrabold uppercase">Scan Rack QR</p>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <div className="mb-3 overflow-hidden border-[2.5px] border-ink bg-cream">
          <div className="relative aspect-video bg-ink/10">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {!scannerReady ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-[12px] font-bold uppercase text-ink/80">
                <Camera size={16} />
                Starting camera...
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mb-3 border-2 border-ink bg-danger-light px-3 py-2 text-[12px] font-semibold">
            {error}
          </div>
        ) : null}

        <p className="mb-1 text-[10px] font-bold uppercase">Manual QR Link (fallback)</p>
        <div className="flex gap-2">
          <input
            className="brutal-input"
            placeholder="Paste inventory QR URL"
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
          />
          <button
            type="button"
            className="brutal-btn bg-primary px-3 py-2 text-[11px] text-white"
            onClick={() => onDetected(manualValue)}
          >
            Go
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferModal({ rooms, staffId, staffName, onClose, onSuccess }) {
  const [items, setItems] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [fromRoomId, setFromRoomId] = useState('')
  const [fromShelfId, setFromShelfId] = useState('')
  const [toRoomId, setToRoomId] = useState('')
  const [toShelfId, setToShelfId] = useState('')
  const [itemId, setItemId] = useState('')
  const [amount, setAmount] = useState(SETTINGS.inventory.countIncrements[1] || 5)

  const [fromShelves, setFromShelves] = useState([])
  const [toShelves, setToShelves] = useState([])
  const [loadingFromShelves, setLoadingFromShelves] = useState(false)
  const [loadingToShelves, setLoadingToShelves] = useState(false)

  useEffect(() => {
    const loadMeta = async () => {
      try {
        setLoadingMeta(true)
        const itemRows = await getItems()
        setItems(itemRows || [])
      } catch (loadError) {
        toast.error(loadError.message || 'Failed to load transfer options')
      } finally {
        setLoadingMeta(false)
      }
    }
    loadMeta()
  }, [])

  useEffect(() => {
    if (!fromRoomId) {
      setFromShelves([])
      setFromShelfId('')
      return
    }
    const loadFromShelves = async () => {
      try {
        setLoadingFromShelves(true)
        const shelves = await getShelvesByRoom(fromRoomId)
        setFromShelves(shelves || [])
        setFromShelfId('')
        setItemId('')
      } catch (loadError) {
        toast.error(loadError.message || 'Failed to load source racks')
      } finally {
        setLoadingFromShelves(false)
      }
    }
    loadFromShelves()
  }, [fromRoomId])

  useEffect(() => {
    if (!toRoomId) {
      setToShelves([])
      setToShelfId('')
      return
    }
    const loadToShelves = async () => {
      try {
        setLoadingToShelves(true)
        const shelves = await getShelvesByRoom(toRoomId)
        setToShelves(shelves || [])
        setToShelfId('')
      } catch (loadError) {
        toast.error(loadError.message || 'Failed to load destination racks')
      } finally {
        setLoadingToShelves(false)
      }
    }
    loadToShelves()
  }, [toRoomId])

  const selectedFromShelf = useMemo(
    () => fromShelves.find((shelf) => shelf.id === fromShelfId) || null,
    [fromShelves, fromShelfId],
  )

  const sourceBalance = useMemo(() => {
    if (!selectedFromShelf || !itemId) return 0
    const balance = (selectedFromShelf.balances || []).find((entry) => entry.item_id === itemId)
    return Number(balance?.current_balance || 0)
  }, [selectedFromShelf, itemId])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === itemId) || null,
    [items, itemId],
  )

  const availableItems = useMemo(() => {
    if (!selectedFromShelf) return items
    const balanceByItem = new Map(
      (selectedFromShelf.balances || []).map((entry) => [entry.item_id, Number(entry.current_balance || 0)]),
    )
    return items.filter((item) => Number(balanceByItem.get(item.id) || 0) > 0)
  }, [items, selectedFromShelf])

  const handleTransfer = async () => {
    if (!fromRoomId || !fromShelfId || !toRoomId || !toShelfId || !itemId) {
      toast.error('Select source room/rack, destination room/rack, and item')
      return
    }
    if (fromShelfId === toShelfId) {
      toast.error('Source and destination racks must be different')
      return
    }
    if (amount > sourceBalance) {
      toast.error(`Only ${sourceBalance} available on source rack`)
      return
    }

    setSubmitting(true)
    try {
      await transferShelfItemCount({
        fromShelfId,
        fromLocationId: fromRoomId,
        toShelfId,
        toLocationId: toRoomId,
        itemId,
        quantity: amount,
        staffId,
        staffName,
        itemName: selectedItem?.name,
        itemLabel: selectedItem?.label,
      })
      onSuccess()
    } catch (transferError) {
      toast.error(transferError.message || 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 px-4 py-6">
      <div className="brutal-card max-h-[90vh] w-full max-w-[640px] overflow-y-auto bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Inventory</p>
            <p className="text-[18px] font-extrabold uppercase">Transfer Stock</p>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        {loadingMeta ? (
          <p className="text-[12px] font-semibold">Loading transfer options...</p>
        ) : (
          <div className="space-y-4">
            <section className="border-2 border-ink bg-cream p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">From</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  className="brutal-input"
                  value={fromRoomId}
                  onChange={(event) => setFromRoomId(event.target.value)}
                >
                  <option value="">Select room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                <select
                  className="brutal-input"
                  value={fromShelfId}
                  onChange={(event) => setFromShelfId(event.target.value)}
                  disabled={!fromRoomId || loadingFromShelves}
                >
                  <option value="">Select rack</option>
                  {fromShelves.map((shelf) => (
                    <option key={shelf.id} value={shelf.id}>
                      {shelf.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="border-2 border-ink bg-cream p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">To</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  className="brutal-input"
                  value={toRoomId}
                  onChange={(event) => setToRoomId(event.target.value)}
                >
                  <option value="">Select room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                <select
                  className="brutal-input"
                  value={toShelfId}
                  onChange={(event) => setToShelfId(event.target.value)}
                  disabled={!toRoomId || loadingToShelves}
                >
                  <option value="">Select rack</option>
                  {toShelves.map((shelf) => (
                    <option key={shelf.id} value={shelf.id}>
                      {shelf.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">Item</p>
              <select
                className="brutal-input"
                value={itemId}
                onChange={(event) => setItemId(event.target.value)}
                disabled={!fromShelfId}
              >
                <option value="">Select item</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label || item.name}
                  </option>
                ))}
              </select>
              {itemId ? (
                <p className="mt-1 text-[11px] font-semibold text-[#6B6B6B]">
                  Available on source rack: <span className="mono text-ink">{sourceBalance}</span>
                </p>
              ) : null}
            </section>

            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">Amount</p>
              <div className="flex flex-wrap gap-2">
                {SETTINGS.inventory.countIncrements.map((increment) => (
                  <button
                    key={increment}
                    type="button"
                    onClick={() => setAmount(increment)}
                    className={`brutal-btn px-3 py-1.5 text-[11px] ${
                      amount === increment ? 'bg-primary text-white' : 'bg-white'
                    }`}
                  >
                    {increment}
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              disabled={submitting}
              className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white"
              onClick={handleTransfer}
            >
              {submitting ? 'Transferring...' : `Transfer ${amount}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
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
      {[1, 2, 3].map((row) => (
        <SkeletonCard key={row} className="p-4 sm:p-5">
          <SkeletonBlock className="mb-4 h-8 w-56" />
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {[1, 2, 3, 4].map((slot) => (
              <div key={slot} className="border-2 border-ink p-2.5">
                <SkeletonBlock className="mb-2 h-5 w-40" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      ))}
    </div>
  )
}
