import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
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

export default function AdminPickupCalendar({
  showAddEvent = false,
  onModalChange = () => { },
  readOnly = false,
}) {
  const { user } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [pickupDates, setPickupDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isRepeated, setIsRepeated] = useState(false)
  const [repeatDays, setRepeatDays] = useState([getDay(new Date())])
  const [showEventDrawer, setShowEventDrawer] = useState(false)
  const [isEventDrawerOpen, setIsEventDrawerOpen] = useState(false)
  const closeDrawerTimerRef = useRef(null)

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

  const eventsByDate = useMemo(() => {
    const grouped = new Map()
    for (const entry of pickupDates) {
      const list = grouped.get(entry.pickup_date) || []
      list.push(entry)
      grouped.set(entry.pickup_date, list)
    }
    return grouped
  }, [pickupDates])

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
      .sort((a, b) => {
        if (a.pickup_date !== b.pickup_date) return a.pickup_date.localeCompare(b.pickup_date)
        const aTime = parseEventNotes(a.notes).startTime || ''
        const bTime = parseEventNotes(b.notes).startTime || ''
        return aTime.localeCompare(bTime)
      })
  }, [pickupDates])

  const upcomingEventGroups = useMemo(() => {
    const grouped = new Map()
    for (const entry of upcomingPickups) {
      const key = entry.pickup_date
      const list = grouped.get(key) || []
      list.push(entry)
      grouped.set(key, list)
    }
    return [...grouped.entries()].map(([date, entries]) => ({ date, entries }))
  }, [upcomingPickups])

  useEffect(
    () => () => {
      if (closeDrawerTimerRef.current) {
        clearTimeout(closeDrawerTimerRef.current)
      }
    },
    [],
  )

  const openEventDrawer = (date) => {
    if (closeDrawerTimerRef.current) {
      clearTimeout(closeDrawerTimerRef.current)
      closeDrawerTimerRef.current = null
    }
    setSelectedDate(date)
    setShowEventDrawer(true)
    requestAnimationFrame(() => setIsEventDrawerOpen(true))
  }

  const closeEventDrawer = () => {
    setIsEventDrawerOpen(false)
    closeDrawerTimerRef.current = setTimeout(() => {
      setShowEventDrawer(false)
      closeDrawerTimerRef.current = null
    }, 220)
  }

  const handleDateClick = (date) => {
    const today = new Date()
    const dateKey = format(date, 'yyyy-MM-dd')
    const dayEvents = eventsByDate.get(dateKey) || []

    setSelectedDate(date)
    setConfirmRemoveId(null)

    if (dayEvents.length) {
      openEventDrawer(date)
      onModalChange(false)
      return
    }

    setShowEventDrawer(false)
    if (!readOnly) {
      if (differenceInCalendarDays(date, today) < 0) return
      onModalChange(true)
    }
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

  const addEventSeries = async (event) => {
    event.preventDefault()
    if (!eventTitle.trim()) {
      toast.error('Add an event title first')
      return
    }

    const seriesDates = new Set()
    if (!isRepeated) {
      seriesDates.add(format(selectedDate, 'yyyy-MM-dd'))
    } else {
      const selectedDays = [...repeatDays]
      if (!selectedDays.length) {
        toast.error('Select at least one repeat day')
        return
      }
      const weeksToRepeat = 12
      for (let weekIndex = 0; weekIndex < weeksToRepeat; weekIndex += 1) {
        const weekStart = startOfWeek(addWeeks(selectedDate, weekIndex), { weekStartsOn: 0 })
        for (const weekday of selectedDays) {
          const eventDate = addDays(weekStart, weekday)
          if (isBefore(eventDate, startOfDay(selectedDate))) continue
          seriesDates.add(format(eventDate, 'yyyy-MM-dd'))
        }
      }
    }

    let successCount = 0
    let failedCount = 0

    for (const dateValue of [...seriesDates].sort()) {
      try {
        const inserted = await addPickupDate(
          dateValue,
          user?.id,
          serializeEventNotes({
            title: eventTitle.trim(),
            description: eventDescription.trim(),
            startTime,
            endTime,
          }),
        )
        setPickupDates((current) =>
          [...current, inserted].sort((a, b) => a.pickup_date.localeCompare(b.pickup_date)),
        )
        successCount += 1
      } catch (_error) {
        failedCount += 1
      }
    }

    if (successCount) toast.success(`Added ${successCount} calendar event${successCount > 1 ? 's' : ''}`)
    if (failedCount) toast.error(`${failedCount} event${failedCount > 1 ? 's' : ''} failed to save`)
    if (successCount) {
      setEventTitle('')
      setEventDescription('')
      setStartTime('')
      setEndTime('')
      setIsRepeated(false)
      setRepeatDays([getDay(selectedDate)])
      onModalChange(false)
    }
  }

  return (
    <section className="mb-6">
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
              <div key={idx} className="skeleton h-[72px] sm:h-[78px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((date) => {
              const dateKey = format(date, 'yyyy-MM-dd')
              const dayEvents = eventsByDate.get(dateKey) || []
              const hasEvents = dayEvents.length > 0
              const inCurrentMonth = isSameMonth(date, currentMonth)
              const isPast = isBefore(date, startOfDay(new Date()))
              const isTodayDate = isSameDay(date, new Date())

              if (!inCurrentMonth) {
                return <div key={dateKey} className="h-[72px] bg-cream sm:h-[78px]" />
              }

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => handleDateClick(date)}
                  className={`relative h-[72px] border text-center sm:h-[78px] ${hasEvents
                    ? isPast
                      ? 'border-[#E8E4DC] bg-[#E8E4DC] text-[#6B6B6B]'
                      : 'border-ink bg-ink text-white'
                    : 'border-[#E8E4DC] bg-white'
                    } ${isTodayDate ? 'border-[2.5px] border-ink font-extrabold' : 'border-[1.5px]'} ${!hasEvents && !isPast ? 'hover:border-primary hover:bg-[#DCE7FF]' : ''}`}
                >
                  <div className="flex h-full flex-col items-center justify-center px-1">
                    <span className="mono text-[14px] font-bold">{format(date, 'd')}</span>
                    {hasEvents ? <Truck size={10} className="mt-0.5" /> : null}
                    {dayEvents.slice(0, 2).map((eventEntry) => {
                      const title = parseEventNotes(eventEntry.notes).title
                      if (!title) return null
                      return (
                        <span key={eventEntry.id} className="mt-0.5 max-w-[95%] truncate text-[8px] font-bold uppercase leading-none">
                          {title}
                        </span>
                      )
                    })}
                    {dayEvents.length > 2 ? (
                      <span className="mt-0.5 text-[8px] font-bold leading-none">+{dayEvents.length - 2} more</span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showAddEvent && !readOnly ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="brutal-card w-full max-w-[640px] bg-white p-5">
            <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Schedule</p>
                <p className="text-[18px] font-extrabold uppercase">Create Event</p>
              </div>
              <button
                type="button"
                className="brutal-btn bg-white px-3 py-1.5 text-[11px]"
                onClick={() => onModalChange(false)}
              >
                Close ✕
              </button>
            </div>
            <form onSubmit={addEventSeries}>
              <input
                className="brutal-input mb-2"
                placeholder="Event title"
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                required
              />
              <textarea
                className="brutal-input mb-2 min-h-[84px] resize-y"
                placeholder="Description (optional)"
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
              />
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase">Date</p>
                  <input
                    className="brutal-input h-12"
                    type="date"
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    onChange={(event) => {
                      const parsed = parseISO(event.target.value)
                      if (!Number.isNaN(parsed.getTime())) setSelectedDate(parsed)
                    }}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase">Repeat Event</p>
                  <select
                    className="brutal-input h-12"
                    value={isRepeated ? 'yes' : 'no'}
                    onChange={(event) => setIsRepeated(event.target.value === 'yes')}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase">Start Time (Optional)</p>
                  <input
                    className="brutal-input h-12"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase">End Time (Optional)</p>
                  <input
                    className="brutal-input h-12"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>
              </div>
              {isRepeated ? (
                <div className="mb-2">
                  <p className="mb-1 text-[10px] font-bold uppercase">Repeat Days</p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const selected = repeatDays.includes(day.value)
                      return (
                        <button
                          key={day.value}
                          type="button"
                          className={`flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-[10px] font-bold uppercase ${selected ? 'border-ink bg-ink text-white' : 'border-ink bg-white text-ink'
                            }`}
                          onClick={() =>
                            setRepeatDays((current) =>
                              current.includes(day.value)
                                ? current.filter((value) => value !== day.value)
                                : [...current, day.value],
                            )
                          }
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${selected ? 'bg-white' : 'border border-ink bg-transparent'
                              }`}
                          />
                          {day.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              <button type="submit" className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white">
                Add Event →
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em]">Upcoming Events</p>
        {!upcomingEventGroups.length ? (
          <p className="text-[12px] text-[#6B6B6B]">No events scheduled</p>
        ) : (
          upcomingEventGroups.map((group) => {
            const date = parseISO(group.date)
            const daysAway = differenceInCalendarDays(date, new Date())
            const dueLabel = daysAway === 0 ? 'TODAY' : `in ${daysAway} days`
            const dueClass = daysAway === 0 ? 'text-primary' : daysAway <= 3 ? 'text-amber' : 'text-[#6B6B6B]'
            return (
              <div key={group.date} className="brutal-card mb-2 bg-white p-3">
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-2 border-b border-stone pb-2 text-left"
                  onClick={() => openEventDrawer(date)}
                >
                  <Truck size={14} />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold">{format(date, 'EEEE, MMMM d')}</p>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">
                      {group.entries.length} event{group.entries.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className={`mono text-[12px] font-bold ${dueClass}`}>{dueLabel}</span>
                </button>

                <div className="space-y-1.5">
                  {group.entries.map((entry) => {
                    const parsed = parseEventNotes(entry.notes)
                    return (
                      <div key={entry.id} className="flex items-start gap-2 rounded-sm border border-stone bg-cream px-2 py-2">
                        <div className="flex-1">
                          <p className="text-[12px] font-semibold">{parsed.title || 'Scheduled event'}</p>
                          {parsed.startTime || parsed.endTime ? (
                            <p className="mono text-[10px] text-[#6B6B6B]">
                              {parsed.startTime || '--:--'} - {parsed.endTime || '--:--'}
                            </p>
                          ) : null}
                          {parsed.description ? <p className="text-[10px] text-[#8A8A8A]">{parsed.description}</p> : null}
                        </div>
                        {!readOnly ? (
                          <button type="button" onClick={() => removeUpcoming(entry)} className="text-[#6B6B6B] text-[10px]">
                            {confirmRemoveId === entry.id ? 'CONFIRM?' : <X size={12} />}
                          </button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {showEventDrawer ? (
        <EventDetailsDrawer
          date={selectedDate}
          entries={eventsByDate.get(format(selectedDate, 'yyyy-MM-dd')) || []}
          open={isEventDrawerOpen}
          onClose={closeEventDrawer}
        />
      ) : null}
    </section>
  )
}

function EventDetailsDrawer({ date, entries, open, onClose }) {
  const overlayStateClass = open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
  const panelStateClass = open ? 'translate-x-0' : 'translate-x-full'
  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-200 ${overlayStateClass}`}>
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close event details"
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-[420px] border-l-[2.5px] border-ink bg-cream shadow-[-6px_0_0_#001A57] transition-transform duration-200 ${panelStateClass}`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b-[2.5px] border-ink bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Event Details</p>
                <h3 className="text-[18px] font-extrabold uppercase">{format(date, 'EEEE, MMMM d')}</h3>
              </div>
              <button type="button" className="brutal-btn bg-white px-2 py-1 text-[10px]" onClick={onClose}>
                Close ✕
              </button>
            </div>
            <div className="mt-3">
              <span className="stamp stamp-amber">{entries.length} EVENT{entries.length === 1 ? '' : 'S'}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {entries.length ? (
              entries.map((entry) => {
                const parsed = parseEventNotes(entry.notes)
                return (
                  <div key={entry.id} className="brutal-card mb-2.5 bg-white p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Truck size={14} />
                      <p className="text-[13px] font-extrabold uppercase">{parsed.title || 'Scheduled event'}</p>
                    </div>
                    {parsed.description ? (
                      <p className="mb-2 text-[12px] text-[#6B6B6B]">{parsed.description}</p>
                    ) : null}
                    {parsed.startTime || parsed.endTime ? (
                      <p className="mono mb-2 text-[11px]">
                        {parsed.startTime || '--:--'} - {parsed.endTime || '--:--'}
                      </p>
                    ) : null}
                  </div>
                )
              })
            ) : (
              <p className="text-[12px] text-[#6B6B6B]">No events found for this date.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

function serializeEventNotes({ title, description, startTime, endTime }) {
  return `LT_EVENT:${JSON.stringify({ title, description, startTime, endTime })}`
}

function parseEventNotes(notes) {
  if (!notes) return { title: '', description: '', startTime: '', endTime: '' }
  if (typeof notes === 'string' && notes.startsWith('LT_EVENT:')) {
    try {
      const parsed = JSON.parse(notes.slice('LT_EVENT:'.length))
      return {
        title: parsed?.title || '',
        description: parsed?.description || '',
        startTime: parsed?.startTime || '',
        endTime: parsed?.endTime || '',
      }
    } catch (_error) {
      return { title: String(notes), description: '', startTime: '', endTime: '' }
    }
  }
  return { title: String(notes), description: '', startTime: '', endTime: '' }
}
