import { useState } from 'react'
import { formatRackCodeInput } from '../lib/rackCodes'

export default function RackCodeModal({ onClose, onSubmit, submitting, eyebrow = 'Inventory' }) {
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
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">{eyebrow}</p>
            <p className="text-[18px] font-extrabold uppercase">Enter Rack Code</p>
          </div>
          <button
            type="button"
            className="brutal-btn bg-white px-3 py-1.5 text-[11px]"
            onClick={onClose}
            disabled={submitting}
          >
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
            disabled={submitting}
            onChange={(event) => setCode(formatRackCodeInput(event.target.value))}
          />
          <button
            type="submit"
            disabled={submitting}
            className="brutal-btn mt-4 w-full bg-primary py-2.5 text-[12px] text-white disabled:opacity-60"
          >
            {submitting ? 'Looking up...' : 'Go to Rack →'}
          </button>
        </form>
      </div>
    </div>
  )
}
