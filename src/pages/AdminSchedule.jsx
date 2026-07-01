import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import AdminPickupCalendar, { ViewHistoryButton } from '../components/AdminPickupCalendar'
import { useAuth } from '../context/AuthContext'

export default function AdminSchedule() {
  const { profile } = useAuth()
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  if (normalizedRole !== 'admin') return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1024px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-6 border-b-[3px] border-ink pb-4 sm:flex sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
            <h2 className="text-[28px] font-extrabold">Schedule Calendar</h2>
          </div>
          <div className="mt-2 flex shrink-0 items-center gap-2 sm:mt-0">
            <ViewHistoryButton active={showHistory} onClick={() => setShowHistory((current) => !current)} />
            <button
              type="button"
              className="brutal-btn flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px] text-primary"
              onClick={() => setShowAddEventModal(true)}
            >
              <Plus size={14} />
              Add Event
            </button>
          </div>
        </div>
        <AdminPickupCalendar
          showAddEvent={showAddEventModal}
          onModalChange={setShowAddEventModal}
          showHistory={showHistory}
          onShowHistoryChange={setShowHistory}
        />
      </main>
      <BottomNav role="admin" />
    </div>
  )
}
