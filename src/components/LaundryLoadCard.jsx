import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import { SETTINGS } from '../config/settings'
import { updateLaundryLoadStatus } from '../lib/queries'
import toast from 'react-hot-toast'

function calculateProgress(startedAt, estimatedFinishAt) {
  const start = new Date(startedAt).getTime()
  const end = new Date(estimatedFinishAt).getTime()
  const now = Date.now()

  const totalDuration = end - start
  const elapsed = now - start
  const progress = (elapsed / totalDuration) * 100

  return {
    progressPercent: Math.min(Math.max(progress, 0), 100),
    isOverdue: now > end,
    elapsedMs: elapsed,
    remainingMs: Math.max(end - now, 0),
    totalDurationMs: totalDuration,
  }
}

function formatTimeRemaining(remainingMs, isOverdue, estimatedFinishAt) {
  if (isOverdue) {
    const overdueMs = Date.now() - new Date(estimatedFinishAt).getTime()
    const overdueMinutes = Math.floor(overdueMs / 60000)
    return `${overdueMinutes} min overdue`
  }

  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s left`
  return `${seconds}s left`
}

export default function LaundryLoadCard({ load, onComplete, showCompleteAction = true }) {
  const [, setTick] = useState(0)
  const [completing, setCompleting] = useState(false)
  const actionControlHeight = '32px'

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const { progressPercent, isOverdue, remainingMs } = calculateProgress(
    load.started_at,
    load.estimated_finish_at,
  )

  const isComplete = load.status === 'complete' || progressPercent >= 100
  const statusLabel = isComplete ? 'CYCLE COMPLETED' : 'ONGOING'

  async function handleComplete() {
    if (!onComplete) return
    setCompleting(true)
    try {
      await updateLaundryLoadStatus(load.id, 'complete')
      toast.success(`Machine #${load.machine_number} marked complete`)
      onComplete(load.id)
    } catch (_err) {
      toast.error('Failed to update load')
      setCompleting(false)
    }
  }

  return (
    <div className="brutal-card" style={{ padding: '10px 12px', marginBottom: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'Space Grotesk',
              fontWeight: 800,
              fontSize: '14px',
              textTransform: 'uppercase',
            }}
          >
            {load.storage_room}
          </div>
          <div
            style={{
              fontFamily: 'JetBrains Mono',
              fontWeight: 700,
              fontSize: '12px',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RefreshCw size={12} />
            MACHINE #{load.machine_number}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#6B6B6B',
              marginTop: '2px',
              fontFamily: 'JetBrains Mono',
              textTransform: 'uppercase',
            }}
          >
            STARTED {format(new Date(load.started_at), 'h:mm a')}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#6B6B6B',
              marginBottom: '2px',
            }}
          >
            EST. FINISH
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: '18px' }}>
            {format(new Date(load.estimated_finish_at), 'h:mm a')}
          </div>
          <div style={{ marginTop: '4px' }}>
            <span
              className={`stamp ${isComplete ? 'stamp-green' : 'stamp-amber'}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px',
          marginBottom: '4px',
        }}
      >
        <div
          style={{
            flex: showCompleteAction ? 1 : 'unset',
            width: showCompleteAction ? 'auto' : '100%',
            height: actionControlHeight,
            border: '2.5px solid #0A0A0A',
            background: '#F5F0E8',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: isComplete ? '#1D9E75' : '#F5A623',
              transition: 'width 1s linear, background-color 0.5s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '6px',
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'JetBrains Mono',
              fontSize: '10px',
              fontWeight: 700,
              color: '#0A0A0A',
            }}
          >
            {isComplete ? 'Done' : formatTimeRemaining(remainingMs, isOverdue, load.estimated_finish_at)}
          </div>
        </div>
        {showCompleteAction ? (
          <button
            className="brutal-btn"
            onClick={handleComplete}
            disabled={completing}
            style={{
              width: '152px',
              height: actionControlHeight,
              padding: '0 10px',
              fontSize: '10px',
              background: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle size={13} />
            {completing ? 'MARKING...' : 'MARK COMPLETE ✓'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
