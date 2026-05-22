import { Clock, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { SETTINGS } from '../config/settings'
import { createLaundryLoad } from '../lib/queries'

export default function NewLoadModal({
  isOpen,
  onClose,
  onLoadCreated,
  activeMachineNumbers = [],
  storageRoomOptions = [],
  creatorName,
  userId,
}) {
  const [machineNumber, setMachineNumber] = useState('')
  const [cycleHours, setCycleHours] = useState('')
  const [cycleMinutesOnly, setCycleMinutesOnly] = useState('')
  const [storageRoom, setStorageRoom] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const safeActiveMachineNumbers = Array.isArray(activeMachineNumbers) ? activeMachineNumbers : []
  const safeStorageRoomOptions = Array.isArray(storageRoomOptions) ? storageRoomOptions : []
  const normalizedMachineNumber = Number.parseInt(machineNumber, 10)
  const machineInUse = Number.isFinite(normalizedMachineNumber)
    ? safeActiveMachineNumbers.map((value) => Number.parseInt(String(value), 10)).includes(normalizedMachineNumber)
    : false

  const computedCycleMinutes =
    Number.parseInt(cycleHours || '0', 10) * 60 + Number.parseInt(cycleMinutesOnly || '0', 10)
  const selectedCycleMinutes =
    computedCycleMinutes > 0 ? computedCycleMinutes : SETTINGS.laundry.totalCycleMinutes

  const estimatedFinishLabel = useMemo(() => {
    if (!normalizedMachineNumber || !storageRoom) return null
    const now = new Date()
    const estimated = new Date(now.getTime() + selectedCycleMinutes * 60 * 1000)
    return format(estimated, 'h:mm a')
  }, [normalizedMachineNumber, storageRoom, selectedCycleMinutes])

  const resetForm = () => {
    setMachineNumber('')
    setCycleHours('')
    setCycleMinutesOnly('')
    setStorageRoom('')
    setNotes('')
    setError('')
    setLoading(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!normalizedMachineNumber) {
      setError('SELECT A MACHINE NUMBER')
      return
    }
    if (normalizedMachineNumber > SETTINGS.laundry.maxMachineNumber) {
      setError(`MACHINE NUMBER MUST BE ${SETTINGS.laundry.maxMachineNumber} OR LOWER`)
      return
    }

    if (!storageRoom) {
      setError('SELECT A STORAGE ROOM')
      return
    }

    if (machineInUse) {
      setError(`MACHINE #${normalizedMachineNumber} IS ALREADY IN USE`)
      return
    }

    try {
      setLoading(true)
      await createLaundryLoad(
        normalizedMachineNumber,
        storageRoom,
        creatorName,
        userId,
        notes,
        selectedCycleMinutes,
      )
      toast.success(`Load started — Machine #${normalizedMachineNumber}`)
      onLoadCreated?.()
      handleClose()
    } catch (submitError) {
      setError(submitError.message || 'Unable to create load.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 bg-black/50" onClick={handleClose} aria-label="Close modal" />

      <div className="absolute inset-x-0 bottom-0 md:flex md:inset-0 md:items-center md:justify-center md:p-4">
        <form
          onSubmit={handleSubmit}
          className="brutal-card relative w-full border-b-0 bg-white px-5 pb-8 pt-6 md:max-w-[440px] md:border-b-[2.5px] md:p-8"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[16px] font-extrabold uppercase">New Laundry Load</h3>
            <button type="button" className="cursor-pointer" onClick={handleClose}>
              <X size={20} />
            </button>
          </div>
          <div className="mb-4 h-0.5 w-full bg-ink" />

          <div className="mb-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.07em]">Washing Machine #</p>
            <input
              type="number"
              min="1"
              max={SETTINGS.laundry.maxMachineNumber}
              step="1"
              className="brutal-input mono"
              placeholder={`Enter machine number (1-${SETTINGS.laundry.maxMachineNumber})`}
              value={machineNumber}
              onChange={(event) => setMachineNumber(event.target.value)}
              disabled={loading}
            />
            {machineInUse ? (
              <div className="mt-2 border-2 border-ink bg-danger px-2.5 py-1.5 text-[10px] font-bold uppercase text-white">
                Machine #{normalizedMachineNumber} in use
              </div>
            ) : null}
          </div>

          <div className="mb-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.07em]">
              Cycle Duration
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.05em]">Hours</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="1"
                  className="brutal-input mono"
                  placeholder="0"
                  value={cycleHours}
                  onChange={(event) => setCycleHours(event.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.05em]">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  className="brutal-input mono"
                  placeholder="0"
                  value={cycleMinutesOnly}
                  onChange={(event) => setCycleMinutesOnly(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[#6B6B6B]">
              Leave both as 0/blank to use default ({SETTINGS.laundry.totalCycleMinutes} min).
            </p>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.07em]">From Storage Room</p>
            <div className="grid grid-cols-3 gap-2">
              {safeStorageRoomOptions.map((room) => {
                const selected = storageRoom === room
                return (
                  <button
                    key={room}
                    type="button"
                    disabled={loading}
                    onClick={() => setStorageRoom(room)}
                    className={`brutal-btn px-2 py-2 text-[10px] ${
                      selected ? 'translate-x-[2px] translate-y-[2px] bg-ink text-white shadow-none' : 'bg-white'
                    }`}
                  >
                    {room}
                  </button>
                )
              })}
            </div>
            {!safeStorageRoomOptions.length ? (
              <p className="mt-2 text-[11px] font-semibold text-danger">
                No storage rooms loaded from database.
              </p>
            ) : null}
          </div>

          {estimatedFinishLabel ? (
            <div className="mb-4 border-2 border-ink bg-cream p-3">
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span className="text-[10px] font-bold uppercase">Estimated Finish:</span>
                <span className="mono text-[14px] font-bold">{estimatedFinishLabel}</span>
              </div>
              <p className="mt-1 text-[11px] text-[#6B6B6B]">
                Wash {SETTINGS.laundry.estimatedCycleMinutes} min + Dry {SETTINGS.laundry.estimatedDryMinutes} min
              </p>
              <p className="mt-1 text-[11px] text-[#6B6B6B]">
                Selected cycle: {selectedCycleMinutes} min
              </p>
            </div>
          ) : null}

          <div className="mb-4">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.07em]">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              className="brutal-input resize-none"
              placeholder="Any special instructions..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={loading}
            />
          </div>

          {error ? (
            <div className="mb-3 border-2 border-ink bg-danger px-3 py-2 text-[12px] font-bold text-white">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !normalizedMachineNumber || !storageRoom || machineInUse}
            className="brutal-btn flex h-12 w-full items-center justify-center bg-primary text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <span className="spinner-circle" /> : 'START LOAD →'}
          </button>
        </form>
      </div>
    </div>
  )
}
