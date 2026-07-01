import { useEffect } from 'react'
import { format } from 'date-fns'
import { Truck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatEventTimeRange, parseEventNotes } from '../lib/eventNotes'

export default function EventDetailModal({ date, event, onClose, viewSchedulePath }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!event) return undefined

    const handleEscape = (keydownEvent) => {
      if (keydownEvent.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [event, onClose])

  if (!date || !event) return null

  const parsed = parseEventNotes(event.notes)
  const timeLabel = formatEventTimeRange(parsed.startTime, parsed.endTime)
  const title = parsed.title || 'Scheduled Event'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-6 sm:items-center sm:pb-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50"
        onClick={onClose}
        aria-label="Close event details"
      />
      <div className="brutal-card relative max-h-[85vh] w-full max-w-[520px] overflow-y-auto bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-3 border-b-[2.5px] border-ink pb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Event Details</p>
            <h3 className="text-[20px] font-extrabold uppercase leading-tight">{title}</h3>
            <p className="mono mt-1 text-[12px] font-bold text-[#6B6B6B]">
              {format(date, 'EEEE, MMMM d')}
            </p>
          </div>
          <button type="button" className="brutal-btn shrink-0 bg-white px-2 py-1 text-[10px]" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="border-2 border-ink bg-cream px-3.5 py-3 shadow-[2px_2px_0_#001A57]">
          <div className="mb-2 flex items-center gap-2">
            <Truck size={14} className="shrink-0" />
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6B6B6B]">Schedule</p>
          </div>

          {timeLabel ? (
            <p className="mono mb-3 text-[13px] font-bold">{timeLabel}</p>
          ) : (
            <p className="mb-3 text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">All day</p>
          )}

          {parsed.description ? (
            <div className="border-t border-stone pt-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
                Description
              </p>
              <p className="text-[14px] leading-relaxed">{parsed.description}</p>
            </div>
          ) : (
            <p className="border-t border-stone pt-3 text-[12px] text-[#6B6B6B]">No additional description.</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {viewSchedulePath ? (
            <button
              type="button"
              className="brutal-btn flex-1 bg-primary px-3 py-2.5 text-[12px] text-white"
              onClick={() => {
                onClose()
                navigate(viewSchedulePath)
              }}
            >
              View Full Schedule →
            </button>
          ) : null}
          <button type="button" className="brutal-btn bg-white px-3 py-2.5 text-[12px]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
