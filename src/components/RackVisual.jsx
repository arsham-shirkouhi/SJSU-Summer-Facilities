import { getItemVisual } from '../lib/rackCodes'

function LinenStacks({ rows, maxStacks = 4 }) {
  const primary = rows[0]
  const visual = getItemVisual(primary?.item_name)
  const total = rows.reduce((sum, row) => sum + Number(row.current_balance || 0), 0)
  const stackCount = Math.min(maxStacks, Math.max(1, Math.ceil(total / 10) || 1))

  return (
    <div className="flex items-end justify-center gap-1 py-1" aria-hidden="true">
      {Array.from({ length: stackCount }).map((_, index) => (
        <div
          key={index}
          className="relative w-7 border-2 border-ink sm:w-8"
          style={{
            height: `${28 + index * 6}px`,
            backgroundColor: visual.light,
            transform: `translateY(${index * -2}px) rotate(${index % 2 === 0 ? -2 : 2}deg)`,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1.5 border-b border-ink/30"
            style={{ backgroundColor: visual.color }}
          />
        </div>
      ))}
    </div>
  )
}

function ShelfPanel({ shelf, selected, onSelect }) {
  const rows = shelf.rows || []
  const total = rows.reduce((sum, row) => sum + Number(row.current_balance || 0), 0)
  const primaryLabel = rows[0]?.item_label
  const hasItems = rows.length > 0

  return (
    <button
      type="button"
      onClick={() => onSelect(shelf)}
      className={`group relative w-full border-[2.5px] border-ink bg-white p-2 text-left transition-all sm:p-3 ${
        selected
          ? 'z-10 -translate-y-0.5 shadow-brutal-lg ring-2 ring-primary'
          : 'shadow-brutal-sm hover:-translate-y-0.5 hover:shadow-brutal'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
            {shelf.shelf_label || `Shelf ${shelf.shelf_level}`}
          </p>
          {primaryLabel ? (
            <p className="text-[11px] font-extrabold uppercase leading-tight sm:text-[12px]">{primaryLabel}</p>
          ) : (
            <p className="text-[11px] font-semibold text-[#8A8A8A]">Empty shelf</p>
          )}
        </div>
        <span className="stamp stamp-ink">{total}</span>
      </div>

      {hasItems ? (
        <>
          <LinenStacks rows={rows} />
          {rows.length > 1 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {rows.slice(0, 3).map((row) => (
                <span key={row.item_id} className="text-[8px] font-bold uppercase text-[#6B6B6B]">
                  {row.item_label}: {row.current_balance}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex h-10 items-center justify-center border border-dashed border-stone bg-cream text-[10px] font-semibold uppercase text-[#8A8A8A]">
          Tap to assign count
        </div>
      )}

      <p className="mt-2 text-right text-[9px] font-bold uppercase text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Count shelf →
      </p>
    </button>
  )
}

export default function RackVisual({ rackUnit, shelves, selectedShelfId, onSelectShelf }) {
  const orderedShelves = [...(shelves || [])].sort((a, b) => Number(b.shelf_level) - Number(a.shelf_level))

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="mb-3 flex items-center justify-between gap-3 border-b-2 border-ink pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Rack Code</p>
          <p className="mono text-[28px] font-extrabold leading-none">{rackUnit.rack_code || '----'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Unit</p>
          <p className="mono text-[14px] font-extrabold uppercase leading-tight">
            {rackUnit.rack_code || rackUnit.name || '----'}
          </p>
          <p className="text-[10px] text-[#6B6B6B]">{rackUnit.roomName}</p>
        </div>
      </div>

      <div className="relative rounded-sm border-[2.5px] border-ink bg-[#E8E4DC] p-3 shadow-brutal">
        <div className="absolute inset-x-8 top-3 bottom-8 border-x-[3px] border-ink/20" aria-hidden="true" />

        <div className="relative space-y-2">
          {orderedShelves.map((shelf) => (
            <ShelfPanel
              key={shelf.id}
              shelf={shelf}
              selected={selectedShelfId === shelf.id}
              onSelect={onSelectShelf}
            />
          ))}
        </div>

        <div className="mt-3 flex justify-center gap-8" aria-hidden="true">
          <div className="h-8 w-3 border-2 border-ink bg-[#C8C4BC]" />
          <div className="h-8 w-3 border-2 border-ink bg-[#C8C4BC]" />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] font-semibold text-[#6B6B6B]">
        Tap a shelf to view and edit its linen counts.
      </p>
    </div>
  )
}
