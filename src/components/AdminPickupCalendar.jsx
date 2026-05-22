import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Truck, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { addPickupDate, getPickupDates, removePickupDate } from '../lib/queries'

export default function AdminPickupCalendar() {
  const { user } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [pickupDates, setPickupDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)

  const refetchDates = async () => {
    try {
      setLoading(true)
      setPickupDates(await getPickupDates())
    } catch (error) {
      toast.error(error.message || 'Failed to load pickup dates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetchDates()
  }, [])

  const pickupMap = useMemo(
    () => new Map(pickupDates.map((entry) => [entry.pickup_date, entry])),
    [pickupDates],
  )

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
    const days = []
    let cursor = start
    while (cursor <= end) {
      days.push(cursor)
      cursor = addDays(cursor, 1)
    }
    return days
  }, [currentMonth])

  const upcomingPickups = useMemo(() => {
    const today = new Date()
    return pickupDates
      .filter((entry) => differenceInCalendarDays(parseISO(entry.pickup_date), today) >= 0)
      .sort((a, b) => a.pickup_date.localeCompare(b.pickup_date))
  }, [pickupDates])

  const handleDateClick = async (date) => {
    const today = new Date()
    const dateString = format(date, 'yyyy-MM-dd')
    if (differenceInCalendarDays(date, today) < 0) return

    const existing = pickupMap.get(dateString)
    if (!existing) {
      try {
        const inserted = await addPickupDate(dateString, user?.id)
        setPickupDates((current) => [...current, inserted].sort((a, b) => a.pickup_date.localeCompare(b.pickup_date)))
        toast.success('Pickup date added')
      } catch (error) {
        toast.error(error.message || 'Failed to add pickup date')
      }
      return
    }

    if (confirmRemoveId === existing.id) {
      try {
        await removePickupDate(existing.id)
        setPickupDates((current) => current.filter((entry) => entry.id !== existing.id))
        setConfirmRemoveId(null)
        toast.success('Pickup date removed')
      } catch (error) {
        toast.error(error.message || 'Failed to remove pickup date')
      }
      return
    }

    setConfirmRemoveId(existing.id)
  }

  const removeUpcoming = async (entry) => {
    if (confirmRemoveId === entry.id) {
      try {
        await removePickupDate(entry.id)
        setPickupDates((current) => current.filter((item) => item.id !== entry.id))
        setConfirmRemoveId(null)
        toast.success('Pickup date removed')
      } catch (error) {
        toast.error(error.message || 'Failed to remove pickup date')
      }
      return
    }
    setConfirmRemoveId(entry.id)
  }

  return (
    <section className="mb-6">
      <div className="mb-3 inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
        Pickup Schedule
      </div>
      <div className="brutal-card bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="brutal-btn h-9 w-9 bg-white" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
            <ChevronLeft size={16} />
          </button>
          <p className="text-[16px] font-extrabold uppercase">{format(currentMonth, 'MMMM yyyy')}</p>
          <button type="button" className="brutal-btn h-9 w-9 bg-white" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mb-2 grid grid-cols-7 border-b-2 border-ink pb-2 text-center text-[10px] font-bold uppercase tracking-[0.08em]">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, idx) => (
              <div key={idx} className="skeleton aspect-square" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd')
              const entry = pickupMap.get(dateKey)
              const inCurrentMonth = isSameMonth(date, currentMonth)
              const isPast = isBefore(date, startOfDay(new Date()))
              const isTodayDate = isSameDay(date, new Date())
              const showConfirm = confirmRemoveId && entry?.id === confirmRemoveId

              if (!inCurrentMonth) {
                return <div key={dateKey} className="aspect-square bg-cream" />
              }

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => handleDateClick(date)}
                  className={`relative aspect-square border text-center ${entry
                      ? isPast
                        ? 'border-[#E8E4DC] bg-[#E8E4DC] text-[#6B6B6B]'
                        : 'border-ink bg-ink text-white'
                      : 'border-[#E8E4DC] bg-white'
                    } ${isTodayDate ? 'border-[2.5px] border-ink font-extrabold' : 'border-[1.5px]'} ${!entry && !isPast ? 'hover:border-primary hover:bg-[#C8F5E5]' : ''}`}
                >
                  <div className="flex h-full flex-col items-center justify-center">
                    <span className="mono text-[14px] font-bold">{format(date, 'd')}</span>
                    {entry ? <Truck size={10} className="mt-0.5" /> : null}
                  </div>
                  {showConfirm ? (
                    <div className="absolute inset-1 flex flex-col items-center justify-center bg-white/95 text-[9px] font-bold text-danger">
                      REMOVE?
                      <div className="mt-1 flex gap-1">
                        <span className="border border-danger px-1">Tap</span>
                        <span
                          className="cursor-pointer text-[#6B6B6B]"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmRemoveId(null)
                          }}
                        >
                          No
                        </span>
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">Upcoming Pickups</p>
        {!upcomingPickups.length ? (
          <p className="text-[12px] text-[#6B6B6B]">No pickups scheduled</p>
        ) : (
          upcomingPickups.map((entry) => {
            const date = parseISO(entry.pickup_date)
            const daysAway = differenceInCalendarDays(date, new Date())
            const dueLabel = daysAway === 0 ? 'TODAY' : `in ${daysAway} days`
            const dueClass = daysAway === 0 ? 'text-primary' : daysAway <= 3 ? 'text-amber' : 'text-[#6B6B6B]'
            return (
              <div key={entry.id} className="mb-1.5 flex items-center gap-2 border-b border-stone py-1.5">
                <Truck size={14} />
                <p className="flex-1 text-[13px] font-semibold">{format(date, 'EEEE, MMMM d')}</p>
                <span className={`mono text-[12px] font-bold ${dueClass}`}>{dueLabel}</span>
                <button type="button" onClick={() => removeUpcoming(entry)} className="text-[#6B6B6B]">
                  {confirmRemoveId === entry.id ? 'CONFIRM?' : <X size={12} />}
                </button>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}
