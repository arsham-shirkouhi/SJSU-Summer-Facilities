import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  ChevronRight,
  Hash,
  Layers,
  Package2,
  Pencil,
  Plus,
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
import RackCodeView from '../components/RackCodeView'
import { getActiveRackItems, RackDeleteModal, RackFormModal } from '../components/RackSetupModals'
import { useAuth } from '../context/AuthContext'
import { formatRackCodeInput, getRackDisplayName, isValidRackCode } from '../lib/rackCodes'
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
  const rackCode = searchParams.get('code')

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
  const [showRackCodeModal, setShowRackCodeModal] = useState(false)
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
  const openRackCode = (code) => setSearchParams({ code: formatRackCodeInput(code) })
  const closeRackCode = () => setSearchParams({})
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

  const refreshRackViews = async () => {
    await Promise.all([fetchRoomDetail(), loadAdminRacks(), fetchRooms()])
  }

  const handleSaveRack = async ({ shelfCount, itemIds, shelfConfigs }) => {
    if (!roomDetail?.roomId) return

    try {
      setRackSubmitting(true)
      if (rackModal?.mode === 'edit' && rackModal.rack?.id) {
        await updateRack({
          rackUnitId: rackModal.rack.id,
          shelfConfigs,
          itemIds: shelfConfigs ? undefined : itemIds,
        })
        toast.success('Rack updated')
      } else {
        const created = await createRack({
          locationId: roomDetail.roomId,
          locationName: roomDetail.roomName,
          shelfCount,
          itemIds,
        })
        toast.success(created?.rack_code ? `Rack added · code ${created.rack_code}` : 'Rack added')
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
      await deleteRack({ rackUnitId: confirmDeleteRack.id })
      toast.success('Rack deleted')
      setConfirmDeleteRack(null)
      await refreshRackViews()
    } catch (deleteError) {
      toast.error(deleteError.message || 'Failed to delete rack')
    } finally {
      setRackDeleting(false)
    }
  }

  const handleRackCodeSubmit = (rawValue) => {
    const value = formatRackCodeInput(rawValue)
    if (!value) {
      toast.error('Enter a rack code')
      return
    }
    if (!isValidRackCode(value)) {
      toast.error('Use a room rack code like JW01, MS02, OG03, PO01, or SV01')
      return
    }

    setShowRackCodeModal(false)
    openRackCode(value)
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
        onClick={() => setShowRackCodeModal(true)}
      >
        <Hash size={14} />
        Enter Code
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

  if (rackCode && !roomId) {
    return (
      <div className="min-h-screen bg-cream">
        <TopBar />
        <main className="mx-auto w-full max-w-[1024px] px-4 pb-20 pt-20 sm:px-6 md:px-8">
          {renderHeader(
            'Inventory',
            'Rack Lookup',
            `Code ${rackCode.toUpperCase()}`,
            closeRackCode,
            'Back to Rooms',
          )}
          <RackCodeView
            rackCode={rackCode}
            staffId={user?.id}
            staffName={profile?.full_name || user?.email || 'Staff'}
            onBack={closeRackCode}
          />
        </main>
        <BottomNav role={profile?.role} />
      </div>
    )
  }

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
        {showRackCodeModal ? (
          <RackCodeModal onClose={() => setShowRackCodeModal(false)} onSubmit={handleRackCodeSubmit} />
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
            className="brutal-btn flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[11px] text-white disabled:opacity-60"
            onClick={openCreateRackModal}
            disabled={loadingAdminRacks || detailLoading}
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
                  Add racks with auto-assigned codes and choose shelf items for each rack.
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
                          <h3 className="mono text-[20px] font-extrabold uppercase">{getRackDisplayName(rack)}</h3>
                          <p className="mt-1 text-[10px] font-semibold uppercase text-[#6B6B6B]">
                            {(rack.shelves || []).length} shelf{(rack.shelves || []).length === 1 ? '' : 'ves'}
                          </p>
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
            locationId={roomId}
            refreshKey={adminRacks.length}
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

function RackCodeModal({ onClose, onSubmit }) {
  const [code, setCode] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit(code)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 px-4">
      <div className="brutal-card w-full max-w-[480px] bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Inventory</p>
            <p className="text-[18px] font-extrabold uppercase">Enter Rack Code</p>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="mb-2 text-[11px] font-semibold text-[#6B6B6B]">
            Enter the rack label code (JW, MS, OG, PO, or SV + number).
          </p>
          <input
            className="brutal-input w-full text-center text-[28px] font-bold uppercase tracking-[0.2em]"
            placeholder="JW01"
            value={code}
            autoFocus
            maxLength={4}
            onChange={(event) => setCode(formatRackCodeInput(event.target.value))}
          />
          <button type="submit" className="brutal-btn mt-4 w-full bg-primary py-2.5 text-[12px] text-white">
            Go to Rack →
          </button>
        </form>
      </div>
    </div>
  )
}

function transferSelectionKey(shelfId, itemId) {
  return `${shelfId}:${itemId}`
}

function TransferModal({ rooms, staffId, staffName, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false)

  const [fromRoomId, setFromRoomId] = useState('')
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
      setItemSelections({})
      return
    }
    const loadFromShelves = async () => {
      try {
        setLoadingFromShelves(true)
        const shelves = await getShelvesByRoom(fromRoomId)
        setFromShelves(shelves || [])
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

  const racksWithStock = useMemo(() => {
    if (!fromShelves.length) return []

    return fromShelves
      .map((shelf) => ({
        shelfId: shelf.id,
        shelfName: shelf.name,
        items: (shelf.balances || [])
          .filter((entry) => Number(entry.current_balance || 0) > 0)
          .map((entry) => ({
            id: entry.item_id,
            name: entry.items?.name,
            label: entry.items?.label || entry.items?.name || 'Item',
            available: Number(entry.current_balance || 0),
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.shelfName.localeCompare(b.shelfName))
  }, [fromShelves])

  const transferItemLookup = useMemo(() => {
    const lookup = new Map()
    for (const rack of racksWithStock) {
      for (const item of rack.items) {
        lookup.set(transferSelectionKey(rack.shelfId, item.id), {
          ...item,
          shelfId: rack.shelfId,
          shelfName: rack.shelfName,
        })
      }
    }
    return lookup
  }, [racksWithStock])

  const selectedTransferItems = useMemo(
    () =>
      Object.entries(itemSelections)
        .filter(([, selection]) => selection.selected && Number(selection.quantity) > 0)
        .map(([selectionKey, selection]) => {
          const item = transferItemLookup.get(selectionKey)
          return {
            selectionKey,
            shelfId: item?.shelfId,
            shelfName: item?.shelfName || 'Rack',
            itemId: item?.id,
            quantity: Number(selection.quantity),
            name: item?.name,
            label: item?.label || 'Item',
            available: item?.available || 0,
          }
        })
        .filter((item) => item.shelfId && item.itemId),
    [itemSelections, transferItemLookup],
  )

  const toggleItemSelection = (shelfId, itemId) => {
    const selectionKey = transferSelectionKey(shelfId, itemId)
    setItemSelections((current) => {
      if (current[selectionKey]?.selected) {
        const next = { ...current }
        delete next[selectionKey]
        return next
      }
      return {
        ...current,
        [selectionKey]: { selected: true, quantity: '' },
      }
    })
  }

  const updateItemQuantity = (shelfId, itemId, rawValue) => {
    const selectionKey = transferSelectionKey(shelfId, itemId)
    const quantity = rawValue.replace(/\D/g, '').slice(0, 5)
    setItemSelections((current) => ({
      ...current,
      [selectionKey]: { selected: true, quantity },
    }))
  }

  const handleTransfer = async () => {
    if (!fromRoomId || !toRoomId || !toShelfId) {
      toast.error('Select source room, destination room, and destination rack')
      return
    }
    if (!selectedTransferItems.length) {
      toast.error('Select at least one item and enter an amount')
      return
    }

    for (const item of selectedTransferItems) {
      if (item.quantity > item.available) {
        toast.error(`Only ${item.available} ${item.label} available on ${item.shelfName}`)
        return
      }
      if (fromRoomId === toRoomId && item.shelfId === toShelfId) {
        toast.error(`${item.label} is already on the destination rack`)
        return
      }
    }

    setSubmitting(true)
    try {
      for (const item of selectedTransferItems) {
        await transferShelfItemCount({
          fromShelfId: item.shelfId,
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
            <p className="mt-2 text-[10px] font-semibold text-[#6B6B6B]">
              Pick items from one or more racks below.
            </p>
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
            {!fromRoomId ? (
              <p className="text-[11px] font-semibold text-[#6B6B6B]">Select a source room first.</p>
            ) : loadingFromShelves ? (
              <p className="text-[11px] font-semibold text-[#6B6B6B]">Loading racks...</p>
            ) : !racksWithStock.length ? (
              <p className="text-[11px] font-semibold text-[#6B6B6B]">No stock available in this room.</p>
            ) : (
              <div className="space-y-3">
                {racksWithStock.map((rack) => (
                  <div key={rack.shelfId} className="border-2 border-ink bg-white p-3">
                    <div className="mb-2 border-b border-stone pb-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack</p>
                      <p className="text-[13px] font-extrabold uppercase">{rack.shelfName}</p>
                    </div>
                    <div className="space-y-2">
                      {rack.items.map((item) => {
                        const selectionKey = transferSelectionKey(rack.shelfId, item.id)
                        const selection = itemSelections[selectionKey]
                        const isSelected = Boolean(selection?.selected)

                        return (
                          <div key={selectionKey} className="border-2 border-ink bg-cream p-3">
                            <label className="flex cursor-pointer items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItemSelection(rack.shelfId, item.id)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-extrabold uppercase leading-tight">{item.label}</p>
                                <p className="mt-1 text-[10px] text-[#6B6B6B]">
                                  Available: <span className="mono font-bold text-ink">{item.available}</span>
                                </p>
                              </div>
                            </label>

                            {isSelected ? (
                              <div className="mt-3 pl-7">
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em]">
                                  Amount to transfer
                                </p>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="brutal-input w-full max-w-[180px] text-center text-[18px] font-bold"
                                  placeholder="0"
                                  value={selection.quantity}
                                  onChange={(event) =>
                                    updateItemQuantity(rack.shelfId, item.id, event.target.value)
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
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
