import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import LaundryLoadCard from './LaundryLoadCard'
import NewLoadModal from './NewLoadModal'
import { SETTINGS } from '../config/settings'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { getActiveLaundryLoads, updateLaundryLoadStatus } from '../lib/queries'

export default function AdminLaundrySection() {
  const { user, profile } = useAuth()
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewLoadModal, setShowNewLoadModal] = useState(false)

  const refetchLoads = async () => {
    try {
      setLoading(true)
      setLoads(await getActiveLaundryLoads())
    } catch (error) {
      toast.error(error.message || 'Failed to load laundry')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetchLoads()
    const channel = supabase
      .channel('admin-laundry')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_loads' }, refetchLoads)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const activeCount = loads.length
  const activeStampClass = activeCount === 0 ? 'stamp-black' : 'stamp-amber'
  const activeMachineNumbers = useMemo(() => loads.map((load) => load.machine_number), [loads])

  const handleComplete = async (id) => {
    const previous = loads
    setLoads((current) => current.filter((load) => load.id !== id))
    try {
      await updateLaundryLoadStatus(id, 'complete')
      toast.success('Load marked complete')
    } catch (error) {
      setLoads(previous)
      toast.error(error.message || 'Failed to complete load')
    }
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
          Laundry Loads
        </div>
        <div className="flex items-center gap-2">
          <span className={`stamp mono ${activeStampClass}`}>{activeCount} ACTIVE</span>
          <button
            type="button"
            className="brutal-btn bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase text-primary"
            onClick={() => setShowNewLoadModal(true)}
          >
            + New Load
          </button>
        </div>
      </div>
      {loading ? (
        <div>
          {[1, 2].map((row) => (
            <div key={row} className="brutal-card mb-2.5 bg-white p-4">
              <div className="skeleton mb-3 h-5 w-44" />
              <div className="skeleton mb-2 h-3 w-full" />
              <div className="skeleton h-3 w-40" />
            </div>
          ))}
        </div>
      ) : !loads.length ? (
        <div className="border-[2.5px] border-ink bg-primary-light px-4 py-3 text-center">
          <p className="text-[14px] font-extrabold uppercase">NO ACTIVE LOADS - ALL MACHINES FREE ✓</p>
        </div>
      ) : (
        <div>
          {loads.map((load) => (
            <LaundryLoadCard key={load.id} load={load} onComplete={handleComplete} />
          ))}
        </div>
      )}
      <NewLoadModal
        isOpen={showNewLoadModal}
        onClose={() => setShowNewLoadModal(false)}
        onLoadCreated={refetchLoads}
        activeMachineNumbers={activeMachineNumbers}
        storageRoomOptions={SETTINGS.storageRooms}
        creatorName={profile?.full_name || 'Admin'}
        userId={user?.id}
      />
    </section>
  )
}
