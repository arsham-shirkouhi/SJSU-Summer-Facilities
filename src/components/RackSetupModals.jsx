import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

export const getActiveRackItems = (rack) =>
  (rack?.shelf_items || [])
    .filter((entry) => entry.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

export function RackFormModal({ mode, roomName, items, initial, submitting, onClose, onSubmit }) {
  const [name, setName] = useState(initial?.name || '')
  const [itemIds, setItemIds] = useState(initial?.itemIds || [])

  useEffect(() => {
    setName(initial?.name || '')
    setItemIds(initial?.itemIds || [])
  }, [initial])

  const toggleItem = (itemId) => {
    setItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    )
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Rack name is required')
      return
    }
    onSubmit({ name, itemIds })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card max-h-[90vh] w-full max-w-[640px] overflow-y-auto bg-white p-5">
        <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Rack Setup</p>
            <p className="text-[18px] font-extrabold uppercase">
              {mode === 'edit' ? 'Edit Rack' : 'Add Rack'}
            </p>
            <p className="text-[11px] text-[#6B6B6B]">{roomName}</p>
          </div>
          <button type="button" className="brutal-btn bg-white px-3 py-1.5 text-[11px]" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-[10px] font-bold uppercase">Rack Name</label>
          <input
            className="brutal-input mb-3"
            placeholder="e.g. Rack A - Towels"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <p className="mb-2 text-[10px] font-bold uppercase">Assign Items To This Rack</p>
          <p className="mb-3 text-[11px] text-[#6B6B6B]">
            Select the linen types that will be stored on this rack.
          </p>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((item) => {
              const selected = itemIds.includes(item.id)
              return (
                <label
                  key={item.id}
                  className={`cursor-pointer border-2 px-3 py-2 text-[11px] font-bold uppercase ${
                    selected ? 'border-ink bg-primary text-white' : 'border-ink bg-white text-ink'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected}
                    onChange={() => toggleItem(item.id)}
                  />
                  {item.label}
                </label>
              )
            })}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
          >
            {submitting ? 'Saving...' : mode === 'edit' ? 'Save Changes →' : 'Save Rack →'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function RackDeleteModal({ rack, deleting, onCancel, onConfirm }) {
  if (!rack) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
      <div className="brutal-card w-full max-w-[480px] bg-white p-5">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Delete Rack</p>
        <h3 className="mt-1 text-[18px] font-extrabold uppercase">{rack.name}</h3>
        <p className="mt-2 text-[12px] text-[#6B6B6B]">
          This removes the rack from inventory. Count history stays in the database.
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
