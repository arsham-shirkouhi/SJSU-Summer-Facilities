import { useEffect, useMemo, useRef, useState, useId } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Camera,
  ChevronRight,
  Layers,
  Package2,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Html5Qrcode } from 'html5-qrcode'
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
  getRackItems,
  getLocationById,
  getLocations,
  getShelvesByRoom,
  getStorageRooms,
  transferShelfItemCount,
  updateRack,
} from '../lib/queries'

const ROOM_ORDER = ['Mailroom Storage', 'Joe west linen', 'OGH', 'P1 Storage', 'SVP']

const formatLastUpdated = (iso) => {
  if (!iso) return 'Never'
  try {
    return format(new Date(iso), 'MMM d, yyyy h:mm a')
  } catch {
    return 'Unknown'
  }
}

const latestUpdatedAt = (rows) =>
  (rows || []).reduce((latest, row) => {
    if (!row?.updated_at) return latest
    if (!latest || new Date(row.updated_at) > new Date(latest)) return row.updated_at
    return latest
  }, null)

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

  const [activeCountItemId, setActiveCountItemId] = useState(null)
  const [countInput, setCountInput] = useState('')
  const [savedBaseline, setSavedBaseline] = useState(0)
  const [savingCount, setSavingCount] = useState(false)
  const [savedConfirmation, setSavedConfirmation] = useState(null)
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
              updated_at: balance.updated_at || null,
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
            updated_at: balance?.updated_at || null,
          }
        })

        return {
          id: shelf.id,
          name: shelf.name,
          rows,
          last_updated_at: latestUpdatedAt(rows),
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
      const [racks, items] = await Promise.all([getAdminRoomRacks(roomId), getRackItems()])
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

  const activeCountRow = useMemo(
    () => selectedShelf?.rows?.find((row) => row.item_id === activeCountItemId) || null,
    [selectedShelf, activeCountItemId],
  )

  useEffect(() => {
    setActiveCountItemId(null)
    setSavedConfirmation(null)
  }, [shelfId])

  const openItemCounter = (row) => {
    const current = Number(row.current_balance || 0)
    setSavedConfirmation(null)
    setActiveCountItemId(row.item_id)
    setCountInput(String(current))
    setSavedBaseline(current)
  }

  const closeItemCounter = () => {
    setActiveCountItemId(null)
    setSavedConfirmation(null)
  }

  const handleSaveCount = async () => {
    if (!selectedShelf || !activeCountRow) return

    const nextCount = Math.max(0, Number(countInput) || 0)
    const change = nextCount - savedBaseline
    if (change === 0) {
      closeItemCounter()
      return
    }

    setSavingCount(true)
    try {
      const result = await adjustShelfItemCount({
        shelfId: selectedShelf.id,
        locationId: roomDetail.roomId,
        itemId: activeCountRow.item_id,
        delta: change,
        staffId: user?.id,
        staffName: profile?.full_name || user?.email || 'Staff',
        itemName: activeCountRow.item_name,
        itemLabel: activeCountRow.item_label,
      })

      if (!result.applied_delta) {
        toast.error('Count is already zero.')
        return
      }

      const updatedAt = result.updated_at || new Date().toISOString()

      setRoomDetail((current) => {
        if (!current) return current
        return {
          ...current,
          shelves: current.shelves.map((shelfEntry) =>
            shelfEntry.id !== selectedShelf.id
              ? shelfEntry
              : {
                  ...shelfEntry,
                  rows: shelfEntry.rows.map((rowEntry) =>
                    rowEntry.item_id === activeCountRow.item_id
                      ? {
                          ...rowEntry,
                          current_balance: result.current_balance,
                          updated_at: updatedAt,
                        }
                      : rowEntry,
                  ),
                  last_updated_at: latestUpdatedAt(
                    shelfEntry.rows.map((rowEntry) =>
                      rowEntry.item_id === activeCountRow.item_id
                        ? { ...rowEntry, updated_at: updatedAt }
                        : rowEntry,
                    ),
                  ),
                },
          ),
        }
      })

      setSavedConfirmation({
        itemLabel: activeCountRow.item_label,
        count: result.current_balance,
        updatedAt,
      })
      toast.success(`Updated ${formatLastUpdated(updatedAt)}`)
    } catch (adjustError) {
      toast.error(adjustError.message || 'Failed to save count')
    } finally {
      setSavingCount(false)
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
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Total Items</p>
                    <p className="mt-2 text-[10px] text-[#6B6B6B]">
                      Last updated: {formatLastUpdated(room.last_count_time)}
                    </p>
                    <div className="mt-2 flex items-center justify-end text-[11px] font-bold uppercase text-primary">
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
                    <p className="mt-2 text-[10px] text-[#6B6B6B]">
                      Last updated: {formatLastUpdated(shelf.last_updated_at)}
                    </p>
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
          activeCountRow
            ? `Enter total for ${activeCountRow.item_label}`
            : 'Select an item to count',
          activeCountRow ? closeItemCounter : () => openRoom(roomId),
          activeCountRow ? 'Back to Items' : 'Back to Racks',
        )}

        {detailError ? (
          <ErrorPanel message={detailError} onRetry={fetchRoomDetail} />
        ) : detailLoading ? (
          <InventorySkeleton />
        ) : !selectedShelf ? (
          <div className="brutal-card bg-white p-4">
            <p className="text-[13px] font-semibold">Rack not found.</p>
          </div>
        ) : !selectedShelf.rows.length ? (
          <div className="brutal-card bg-white p-4">
            <p className="text-[12px] text-[#6B6B6B]">
              No items assigned to this rack yet. An admin can assign items with Manage Racks.
            </p>
          </div>
        ) : activeCountRow ? (
          <section className="brutal-card bg-white p-4 sm:p-5">
            {savedConfirmation ? (
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary">Saved</p>
                <h2 className="mt-1 text-[20px] font-extrabold uppercase">{savedConfirmation.itemLabel}</h2>
                <p className="mono mt-3 text-[42px] font-bold leading-none">{savedConfirmation.count}</p>
                <p className="mt-4 text-[12px] font-bold uppercase text-[#6B6B6B]">Updated</p>
                <p className="mono mt-1 text-[14px] font-bold">
                  {formatLastUpdated(savedConfirmation.updatedAt)}
                </p>
                <button
                  type="button"
                  className="brutal-btn mt-6 w-full bg-primary py-3 text-[13px] text-white"
                  onClick={closeItemCounter}
                >
                  Back to Items →
                </button>
              </div>
            ) : (
              <>
                <div className="mb-5 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
                    Current Count: {savedBaseline}
                  </p>
                  <p className="mt-1 text-[10px] text-[#6B6B6B]">
                    Last updated: {formatLastUpdated(activeCountRow.updated_at)}
                  </p>
                  <input
                    className="brutal-input mx-auto mt-3 w-full max-w-[240px] text-center text-[36px] font-bold"
                    inputMode="numeric"
                    placeholder="0"
                    value={countInput}
                    disabled={savingCount}
                    autoFocus
                    onChange={(event) =>
                      setCountInput(event.target.value.replace(/\D/g, '').slice(0, 5))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleSaveCount()
                      }
                    }}
                  />
                </div>

                <button
                  type="button"
                  disabled={savingCount}
                  className="brutal-btn w-full bg-primary py-3 text-[13px] text-white disabled:opacity-60"
                  onClick={handleSaveCount}
                >
                  {savingCount ? 'Saving...' : 'Save Count →'}
                </button>
              </>
            )}
          </section>
        ) : (
          <>
            {selectedShelf.last_updated_at ? (
              <p className="mb-3 text-[11px] text-[#6B6B6B]">
                Rack last updated: {formatLastUpdated(selectedShelf.last_updated_at)}
              </p>
            ) : null}
            <section className="grid grid-cols-2 gap-3">
              {selectedShelf.rows.map((row) => (
                <button
                  key={row.item_id}
                  type="button"
                  onClick={() => openItemCounter(row)}
                  className="brutal-card group bg-white p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-extrabold uppercase leading-tight">{row.item_label}</p>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border-[2px] border-ink bg-cream text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                      <Pencil size={13} strokeWidth={2.5} />
                    </span>
                  </div>
                  <p className="mono mt-2 text-[28px] font-bold leading-none">{row.current_balance}</p>
                  <p className="mt-2 text-[9px] uppercase tracking-[0.06em] text-[#6B6B6B]">
                    Updated {formatLastUpdated(row.updated_at)}
                  </p>
                  <div className="mt-2 flex items-center justify-end text-[11px] font-bold uppercase text-primary">
                    Count
                    <ChevronRight size={14} strokeWidth={3} />
                  </div>
                </button>
              ))}
            </section>
          </>
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
  const scannerRegionId = useId().replace(/:/g, '')
  const scannerRef = useRef(null)
  const [error, setError] = useState('')
  const [manualValue, setManualValue] = useState('')
  const [scannerReady, setScannerReady] = useState(false)

  useEffect(() => {
    let active = true
    let scanner = null

    const stopScanner = async () => {
      if (!scanner) return
      try {
        if (scanner.isScanning) {
          await scanner.stop()
        }
        scanner.clear()
      } catch (_error) {
        // Ignore cleanup errors when the modal closes mid-scan.
      }
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available in this browser. Paste the QR link below.')
        return
      }

      try {
        scanner = new Html5Qrcode(scannerRegionId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.min(viewfinderWidth, viewfinderHeight)
              const size = Math.max(180, Math.floor(edge * 0.72))
              return { width: size, height: size }
            },
            aspectRatio: 1.777778,
          },
          (decodedText) => {
            if (!active) return
            active = false
            stopScanner().finally(() => onDetected(decodedText))
          },
          () => {},
        )

        if (!active) {
          await stopScanner()
          return
        }

        setScannerReady(true)
      } catch (_error) {
        if (active) {
          setError('Unable to access camera. Check permissions or paste the QR link below.')
        }
      }
    }

    start()

    return () => {
      active = false
      stopScanner()
      scannerRef.current = null
    }
  }, [onDetected, scannerRegionId])

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
            <div id={scannerRegionId} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
            {!scannerReady && !error ? (
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
  const [submitting, setSubmitting] = useState(false)

  const [fromRoomId, setFromRoomId] = useState('')
  const [fromShelfId, setFromShelfId] = useState('')
  const [toRoomId, setToRoomId] = useState('')
  const [toShelfId, setToShelfId] = useState('')
  const [itemSelections, setItemSelections] = useState({})

  const [fromShelves, setFromShelves] = useState([])
  const [toShelves, setToShelves] = useState([])
  const [loadingFromShelves, setLoadingFromShelves] = useState(false)
  const [loadingToShelves, setLoadingToShelves] = useState(false)

  useEffect(() => {
    if (!fromRoomId) {
      setFromShelves([])
      setFromShelfId('')
      setItemSelections({})
      return
    }
    const loadFromShelves = async () => {
      try {
        setLoadingFromShelves(true)
        const shelves = await getShelvesByRoom(fromRoomId)
        setFromShelves(shelves || [])
        setFromShelfId('')
        setItemSelections({})
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

  const availableTransferItems = useMemo(() => {
    if (!selectedFromShelf) return []
    return (selectedFromShelf.balances || [])
      .filter((entry) => Number(entry.current_balance || 0) > 0)
      .map((entry) => ({
        id: entry.item_id,
        name: entry.items?.name,
        label: entry.items?.label || entry.items?.name || 'Item',
        available: Number(entry.current_balance || 0),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [selectedFromShelf])

  const selectedTransferItems = useMemo(
    () =>
      Object.entries(itemSelections)
        .filter(([, selection]) => selection.selected && Number(selection.quantity) > 0)
        .map(([itemId, selection]) => {
          const item = availableTransferItems.find((entry) => entry.id === itemId)
          return {
            itemId,
            quantity: Number(selection.quantity),
            name: item?.name,
            label: item?.label || 'Item',
            available: item?.available || 0,
          }
        }),
    [itemSelections, availableTransferItems],
  )

  const toggleItemSelection = (itemId) => {
    setItemSelections((current) => {
      if (current[itemId]?.selected) {
        const next = { ...current }
        delete next[itemId]
        return next
      }
      return {
        ...current,
        [itemId]: { selected: true, quantity: '' },
      }
    })
  }

  const updateItemQuantity = (itemId, rawValue) => {
    const quantity = rawValue.replace(/\D/g, '').slice(0, 5)
    setItemSelections((current) => ({
      ...current,
      [itemId]: { selected: true, quantity },
    }))
  }

  const handleTransfer = async () => {
    if (!fromRoomId || !fromShelfId || !toRoomId || !toShelfId) {
      toast.error('Select source and destination room/rack')
      return
    }
    if (fromShelfId === toShelfId) {
      toast.error('Source and destination racks must be different')
      return
    }
    if (!selectedTransferItems.length) {
      toast.error('Select at least one item and enter an amount')
      return
    }

    for (const item of selectedTransferItems) {
      if (item.quantity > item.available) {
        toast.error(`Only ${item.available} ${item.label} available on source rack`)
        return
      }
    }

    setSubmitting(true)
    try {
      for (const item of selectedTransferItems) {
        await transferShelfItemCount({
          fromShelfId,
          fromLocationId: fromRoomId,
          toShelfId,
          toLocationId: toRoomId,
          itemId: item.itemId,
          quantity: item.quantity,
          staffId,
          staffName,
          itemName: item.name,
          itemLabel: item.label,
        })
      }
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
                onChange={(event) => {
                  setFromShelfId(event.target.value)
                  setItemSelections({})
                }}
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
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">Items to Transfer</p>
            {!fromShelfId ? (
              <p className="text-[11px] font-semibold text-[#6B6B6B]">Select a source rack first.</p>
            ) : loadingFromShelves ? (
              <p className="text-[11px] font-semibold text-[#6B6B6B]">Loading rack items...</p>
            ) : !availableTransferItems.length ? (
              <p className="text-[11px] font-semibold text-[#6B6B6B]">No stock available on this rack.</p>
            ) : (
              <div className="space-y-2">
                {availableTransferItems.map((item) => {
                  const selection = itemSelections[item.id]
                  const isSelected = Boolean(selection?.selected)

                  return (
                    <div key={item.id} className="border-2 border-ink bg-cream p-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItemSelection(item.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-extrabold uppercase leading-tight">{item.label}</p>
                          <p className="mt-1 text-[10px] text-[#6B6B6B]">
                            Available on rack: <span className="mono font-bold text-ink">{item.available}</span>
                          </p>
                        </div>
                      </label>

                      {isSelected ? (
                        <div className="mt-3 pl-7">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em]">Amount to transfer</p>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="brutal-input w-full max-w-[180px] text-center text-[18px] font-bold"
                            placeholder="0"
                            value={selection.quantity}
                            onChange={(event) => updateItemQuantity(item.id, event.target.value)}
                          />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <button
            type="button"
            disabled={submitting}
            className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
            onClick={handleTransfer}
          >
            {submitting
              ? 'Transferring...'
              : selectedTransferItems.length
                ? `Transfer ${selectedTransferItems.length} item${selectedTransferItems.length === 1 ? '' : 's'}`
                : 'Transfer Selected'}
          </button>
        </div>
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
