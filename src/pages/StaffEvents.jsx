import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import AdminPickupCalendar, { ViewHistoryButton } from '../components/AdminPickupCalendar'
import { useAuth } from '../context/AuthContext'

export default function StaffEvents() {
  const { profile } = useAuth()
  const [showHistory, setShowHistory] = useState(false)
  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  if (normalizedRole !== 'staff') return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1024px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-6 flex items-end justify-between gap-3 border-b-[3px] border-ink pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B6B]">Staff</p>
            <h2 className="text-[28px] font-extrabold">Events Calendar</h2>
          </div>
          <ViewHistoryButton
            active={showHistory}
            onClick={() => setShowHistory((current) => !current)}
            className="shrink-0"
          />
        </div>
        <AdminPickupCalendar
          readOnly
          showHistory={showHistory}
          onShowHistoryChange={setShowHistory}
        />
      </main>
      <BottomNav role="staff" />
    </div>
  )
}
