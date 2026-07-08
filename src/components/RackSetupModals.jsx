import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getRoomRackPrefix } from '../lib/rackCodes'
import { createCustomItem, getNextRackCodeForRoom, isCustomInventoryItem } from '../lib/queries'

export const getActiveRackItems = (rack) =>
  (rack?.shelf_items || [])
    .filter((entry) => entry.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

function ItemPickerOption({ item, selected, onToggle }) {
  const custom = isCustomInventoryItem(item)

  return (
    <label
      className={`cursor-pointer border-2 px-3 py-2 text-[11px] font-bold uppercase ${
        selected ? 'border-ink bg-primary text-white' : 'border-ink bg-white text-ink'
      }`}
    >
      <input type="checkbox" className="sr-only" checked={selected} onChange={onToggle} />
      <span className="flex items-center justify-between gap-2">
        <span>{item.label}</span>
        {custom ? (
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[8px] tracking-[0.08em] ${
              selected ? 'bg-white/20 text-white' : 'bg-amber text-ink'
            }`}
          >
            Custom
          </span>
        ) : null}
      </span>
    </label>
  )
}

export function CustomItemCreator({ onCreated, disabled }) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!label.trim()) {
      toast.error('Enter a name for the custom item')
      return
    }

    try {
      setSaving(true)
      const item = await createCustomItem(label)
      setLabel('')
      onCreated?.(item)
      toast.success(`Added custom item · ${item.label}`)
    } catch (error) {
      toast.error(error.message || 'Failed to add custom item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-2 border-dashed border-ink bg-white p-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em]">Add Custom Item Type</p>
      <p className="mb-2 text-[10px] text-[#6B6B6B]">
        Create a new inventory type beyond the 6 standard linen items.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="brutal-input flex-1"
          placeholder="e.g. Mattress Pads"
          value={label}
          maxLength={60}
          disabled={disabled || saving}
          onChange={(event) => setLabel(event.target.value)}
        />
        <button
          type="submit"
          disabled={disabled || saving}
          className="brutal-btn bg-amber px-3 py-2 text-[11px] disabled:opacity-60"
        >
          {saving ? 'Adding...' : 'Add Type'}
        </button>
      </div>
    </form>
  )
}

function ShelfItemPicker({ shelfLabel, itemIds, items, onChange }) {
  const toggleItem = (itemId) => {
    onChange(
      itemIds.includes(itemId) ? itemIds.filter((id) => id !== itemId) : [...itemIds, itemId],
    )
  }

  return (
    <div className="mb-4 border-2 border-stone bg-cream p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">{shelfLabel}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const selected = itemIds.includes(item.id)
          return (
            <ItemPickerOption
              key={item.id}
              item={item}
              selected={selected}
              onToggle={() => toggleItem(item.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

export function RackFormModal({
  mode,
  roomName,
  locationId,
  refreshKey,
  items,
  initial,
  submitting,
  allowCustomItems = false,
  onItemsReload,
  onClose,
  onSubmit,
}) {
  const [shelfCount, setShelfCount] = useState(initial?.shelfCount || 3)
  const [itemIds, setItemIds] = useState(initial?.itemIds || [])
  const [shelfConfigs, setShelfConfigs] = useState(initial?.shelfConfigs || [])
  const [nextRackCode, setNextRackCode] = useState('')

  const roomPrefix = getRoomRackPrefix(roomName)
  const rackCode = mode === 'edit' ? initial?.rackCode || '' : nextRackCode

  useEffect(() => {
    setShelfCount(initial?.shelfCount || 3)
    setItemIds(initial?.itemIds || [])
    setShelfConfigs(initial?.shelfConfigs || [])
  }, [initial])

  useEffect(() => {
    if (mode !== 'create' || !roomName) {
      setNextRackCode('')
      return
    }

    let cancelled = false
    getNextRackCodeForRoom(roomName, locationId)
      .then((code) => {
        if (!cancelled) setNextRackCode(code)
      })
      .catch(() => {
        if (!cancelled) setNextRackCode('')
      })

    return () => {
      cancelled = true
    }
  }, [mode, roomName, locationId, refreshKey])

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit({
      shelfCount: mode === 'create' ? shelfCount : undefined,
      itemIds: mode === 'create' ? itemIds : undefined,
      shelfConfigs: mode === 'edit' && shelfConfigs.length ? shelfConfigs : undefined,
    })
  }

  const updateShelfItems = (shelfId, nextItemIds) => {
    setShelfConfigs((current) =>
      current.map((config) =>
        config.shelfId === shelfId ? { ...config, itemIds: nextItemIds } : config,
      ),
    )
  }

  const handleCustomItemCreated = async (item) => {
    await onItemsReload?.()
    if (mode === 'create') {
      setItemIds((current) => (current.includes(item.id) ? current : [...current, item.id]))
    }
  }

  const itemPickerSections = (
    <>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const selected = itemIds.includes(item.id)
          return (
            <ItemPickerOption
              key={item.id}
              item={item}
              selected={selected}
              onToggle={() =>
                setItemIds((current) =>
                  current.includes(item.id)
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
            />
          )
        })}
      </div>
      {allowCustomItems ? (
        <CustomItemCreator onCreated={handleCustomItemCreated} disabled={submitting} />
      ) : null}
    </>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card max-h-[90vh] w-full max-w-[640px] overflow-y-auto bg-white p-5">
        <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Rack Setup</p>
            <p className="text-[18px] font-extrabold uppercase">
              {mode === 'edit' ? `Edit ${rackCode || 'Rack'}` : 'Add Rack'}
            </p>
            <p className="text-[11px] text-[#6B6B6B]">{roomName}</p>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-3 border-2 border-ink bg-cream px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack Code</p>
            <p className="mono mt-1 text-[28px] font-extrabold">{rackCode || '----'}</p>
            {mode === 'create' ? (
              <p className="mt-1 text-[10px] font-semibold text-[#6B6B6B]">
                This code identifies the rack
                {roomPrefix ? ` · room prefix ${roomPrefix}` : ''}
              </p>
            ) : null}
          </div>

          {mode === 'create' ? (
            <>
              <label className="mb-1 block text-[10px] font-bold uppercase">Shelf Count</label>
              <select
                className="brutal-input mb-3 h-12"
                value={shelfCount}
                onChange={(event) => setShelfCount(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count} shelf{count === 1 ? '' : 'es'}
                  </option>
                ))}
              </select>

              <p className="mb-2 text-[10px] font-bold uppercase">Default Items On Bottom Shelf</p>
              <p className="mb-3 text-[11px] text-[#6B6B6B]">
                New racks start with these items on the bottom shelf. Edit each shelf after saving.
              </p>
              {itemPickerSections}
            </>
          ) : shelfConfigs.length ? (
            <>
              <p className="mb-2 text-[10px] font-bold uppercase">Items Per Shelf</p>
              <p className="mb-3 text-[11px] text-[#6B6B6B]">
                Choose which linen types belong on each shelf of this rack.
              </p>
              {shelfConfigs.map((config) => (
                <ShelfItemPicker
                  key={config.shelfId}
                  shelfLabel={config.shelfLabel}
                  itemIds={config.itemIds || []}
                  items={items}
                  onChange={(nextItemIds) => updateShelfItems(config.shelfId, nextItemIds)}
                />
              ))}
              {allowCustomItems ? (
                <CustomItemCreator onCreated={handleCustomItemCreated} disabled={submitting} />
              ) : null}
            </>
          ) : (
            <>
              <p className="mb-2 text-[10px] font-bold uppercase">Assign Items To This Rack</p>
              {itemPickerSections}
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
          >
            {submitting ? 'Saving...' : mode === 'edit' ? 'Save Changes →' : 'Add Rack →'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function RackDeleteModal({ rack, deleting, onCancel, onConfirm }) {
  if (!rack) return null

  const label = rack.rack_code || rack.name || 'Rack'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card w-full max-w-[480px] bg-white p-5">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Delete Rack</p>
        <h3 className="mono mt-1 text-[24px] font-extrabold uppercase">{label}</h3>
        <p className="mt-2 text-[12px] text-[#6B6B6B]">
          This removes the rack and all of its shelves from inventory. Count history stays in the database.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="brutal-btn bg-white py-2 text-[11px]"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="brutal-btn bg-danger py-2 text-[11px] text-white disabled:opacity-60"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Rack'}
          </button>
        </div>
      </div>
    </div>
  )
}
