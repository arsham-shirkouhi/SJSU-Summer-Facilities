import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { adjustShelfItemCount } from '../lib/queries'
import { getItemVisual } from '../lib/rackCodes'

const formatLastUpdated = (iso) => {
  if (!iso) return 'Never'
  try {
    return format(new Date(iso), 'MMM d, h:mm a')
  } catch {
    return 'Unknown'
  }
}

export default function ShelfCountDrawer({
  shelf,
  roomId,
  open,
  onClose,
  staffId,
  staffName,
  onSaved,
}) {
  const [activeItemId, setActiveItemId] = useState(null)
  const [countInput, setCountInput] = useState('')
  const [savedBaseline, setSavedBaseline] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedConfirmation, setSavedConfirmation] = useState(null)

  const rows = shelf?.rows || []
  const activeRow = rows.find((row) => row.item_id === activeItemId) || null

  useEffect(() => {
    setActiveItemId(null)
    setSavedConfirmation(null)
  }, [shelf?.id, open])

  const openCounter = (row) => {
    const current = Number(row.current_balance || 0)
    setSavedConfirmation(null)
    setActiveItemId(row.item_id)
    setCountInput(String(current))
    setSavedBaseline(current)
  }

  const closeCounter = () => {
    setActiveItemId(null)
    setSavedConfirmation(null)
  }

  const handleSave = async () => {
    if (!shelf || !activeRow) return

    const nextCount = Math.max(0, Number(countInput) || 0)
    const change = nextCount - savedBaseline
    if (change === 0) {
      closeCounter()
      return
    }

    setSaving(true)
    try {
      const result = await adjustShelfItemCount({
        shelfId: shelf.id,
        locationId: roomId,
        itemId: activeRow.item_id,
        delta: change,
        staffId,
        staffName,
        itemName: activeRow.item_name,
        itemLabel: activeRow.item_label,
      })

      if (!result.applied_delta) {
        toast.error('Count is already zero.')
        return
      }

      const updatedAt = result.updated_at || new Date().toISOString()
      setSavedConfirmation({
        itemLabel: activeRow.item_label,
        count: result.current_balance,
        updatedAt,
      })
      onSaved?.({
        shelfId: shelf.id,
        itemId: activeRow.item_id,
        current_balance: result.current_balance,
        updated_at: updatedAt,
      })
      toast.success('Count saved')
    } catch (error) {
      toast.error(error.message || 'Failed to save count')
    } finally {
      setSaving(false)
    }
  }

  if (!shelf) return null

  const overlayStateClass = open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  const panelStateClass = open ? 'translate-x-0' : 'translate-x-full'

  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-200 ${overlayStateClass}`}>
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close shelf counter"
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-[420px] border-l-[2.5px] border-ink bg-cream shadow-[-6px_0_0_#001A57] transition-transform duration-200 ${panelStateClass}`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b-[2.5px] border-ink bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Shelf Count</p>
                <h3 className="text-[18px] font-extrabold uppercase">
                  {shelf.shelf_label || `Shelf ${shelf.shelf_level}`}
                </h3>
              </div>
              <button type="button" className="brutal-btn bg-white px-2 py-1 text-[10px]" onClick={onClose}>
                Close ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {savedConfirmation ? (
              <div className="brutal-card bg-white p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary">Saved</p>
                <h4 className="mt-1 text-[18px] font-extrabold uppercase">{savedConfirmation.itemLabel}</h4>
                <p className="mono mt-3 text-[42px] font-bold leading-none">{savedConfirmation.count}</p>
                <p className="mt-4 text-[11px] text-[#6B6B6B]">
                  Updated {formatLastUpdated(savedConfirmation.updatedAt)}
                </p>
                <button
                  type="button"
                  className="brutal-btn mt-5 w-full bg-primary py-2.5 text-[12px] text-white"
                  onClick={closeCounter}
                >
                  Back to Shelf Items →
                </button>
              </div>
            ) : activeRow ? (
              <div className="brutal-card bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
                  {activeRow.item_label}
                </p>
                <p className="mt-1 text-[10px] text-[#6B6B6B]">
                  Current: {savedBaseline} · Updated {formatLastUpdated(activeRow.updated_at)}
                </p>
                <input
                  className="brutal-input mx-auto mt-4 w-full max-w-[220px] text-center text-[36px] font-bold"
                  inputMode="numeric"
                  placeholder="0"
                  value={countInput}
                  disabled={saving}
                  autoFocus
                  onChange={(event) =>
                    setCountInput(event.target.value.replace(/\D/g, '').slice(0, 5))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSave()
                    }
                  }}
                />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="brutal-btn bg-white py-2 text-[11px]" onClick={closeCounter}>
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="brutal-btn bg-primary py-2 text-[11px] text-white disabled:opacity-60"
                    onClick={handleSave}
                  >
                    {saving ? 'Saving...' : 'Save Count →'}
                  </button>
                </div>
              </div>
            ) : !rows.length ? (
              <p className="text-[12px] text-[#6B6B6B]">No items assigned to this shelf yet.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => {
                  const visual = getItemVisual(row.item_name)
                  return (
                    <button
                      key={row.item_id}
                      type="button"
                      onClick={() => openCounter(row)}
                      className="brutal-card flex w-full items-center gap-3 bg-white p-3 text-left transition-transform hover:-translate-y-0.5"
                      style={{ borderLeftWidth: '5px', borderLeftColor: visual.color }}
                    >
                      <span className="text-[22px]" aria-hidden="true">
                        {visual.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-extrabold uppercase">{row.item_label}</p>
                        <p className="text-[10px] text-[#6B6B6B]">
                          Updated {formatLastUpdated(row.updated_at)}
                        </p>
                      </div>
                      <p className="mono text-[24px] font-bold">{row.current_balance}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
