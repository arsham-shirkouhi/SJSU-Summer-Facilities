import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { supabase } from '../supabase'
import { getAllTasksForToday } from '../lib/queries'

export default function AdminTodoSummary({ onOpenDetail }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = async () => {
    try {
      setLoading(true)
      setTasks(await getAllTasksForToday())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel('admin-task-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refetch)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const counts = useMemo(() => {
    let ongoing = 0
    let notStarted = 0
    let complete = 0
    for (const task of tasks) {
      if (task.status === 'in_progress') ongoing += 1
      else if (task.status === 'complete') complete += 1
      else notStarted += 1
    }
    return { ongoing, notStarted, complete }
  }, [tasks])

  const cards = [
    {
      key: 'ongoing',
      label: 'ONGOING',
      value: counts.ongoing,
      valueColor: 'text-amber',
      accentBorder: 'border-l-amber',
    },
    {
      key: 'notStarted',
      label: 'NOT STARTED',
      value: counts.notStarted,
      valueColor: 'text-danger',
      accentBorder: 'border-l-danger',
    },
    {
      key: 'complete',
      label: 'COMPLETED',
      value: counts.complete,
      valueColor: 'text-primary',
      accentBorder: 'border-l-primary',
    },
  ]

  return (
    <section className="mb-6">
      <div className="mb-3 inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
        Todo Overview
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`group brutal-card border-l-4 bg-white px-4 py-3 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#0A0A0A] active:translate-y-0.5 active:shadow-[2px_2px_0_#0A0A0A] ${card.accentBorder}`}
            onClick={onOpenDetail}
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">{card.label}</p>
              <ArrowUpRight size={16} className="text-ink transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className={`mono text-[28px] font-bold ${loading ? 'text-[#A0A0A0]' : card.valueColor}`}>
              {loading ? '...' : card.value}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}
