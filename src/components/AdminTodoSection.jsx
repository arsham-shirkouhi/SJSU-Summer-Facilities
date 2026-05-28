import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Check, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { deleteTask, getAllTasksForToday, insertTask, updateTaskStatus } from '../lib/queries'

const STATUS_FLOW = { pending: 'in_progress', in_progress: 'complete', complete: 'pending' }

function groupTasks(tasks) {
  return {
    ongoing: tasks.filter((t) => t.status === 'in_progress'),
    notStarted: tasks.filter((t) => t.status === 'pending'),
    complete: tasks.filter((t) => t.status === 'complete'),
  }
}

export default function AdminTodoSection() {
  const { user, profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    ongoing: true,
    notStarted: false,
    complete: false,
  })
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [newTask, setNewTask] = useState({ title: '', details: '', is_priority: false })

  const grouped = useMemo(() => groupTasks(tasks), [tasks])

  const refetchTasks = async () => {
    try {
      setLoading(true)
      setTasks(await getAllTasksForToday())
    } catch (error) {
      toast.error(error.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetchTasks()
    const channel = supabase
      .channel('admin-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const toggleSection = (key) =>
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))

  const cycleTask = async (task) => {
    const nextStatus = STATUS_FLOW[task.status] || 'pending'
    setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, status: nextStatus } : row)))
    try {
      await updateTaskStatus(task.id, nextStatus)
      toast.success('Task updated')
    } catch (error) {
      setTasks((current) => current.map((row) => (row.id === task.id ? task : row)))
      toast.error(error.message || 'Failed to update task')
    }
  }

  const confirmDeleteTask = async (taskId) => {
    try {
      await deleteTask(taskId)
      setTasks((current) => current.filter((task) => task.id !== taskId))
      setPendingDeleteId(null)
      toast.success('Task deleted')
    } catch (error) {
      toast.error(error.message || 'Failed to delete task')
    }
  }

  const submitTask = async (event) => {
    event.preventDefault()
    try {
      const created = await insertTask({
        title: newTask.title,
        details: newTask.details || null,
        assigned_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'pending',
        is_priority: newTask.is_priority,
        creator_name: profile?.full_name || user?.email || 'Admin',
        created_by: user?.id || null,
      })
      setTasks((current) => [created, ...current])
      setNewTask({ title: '', details: '', is_priority: false })
      setShowAddTask(false)
      setExpandedSections((prev) => ({ ...prev, notStarted: true }))
      toast.success('Task logged')
    } catch (error) {
      toast.error(error.message || 'Failed to add task')
    }
  }

  const renderToggle = (status) => (
    <button
      type="button"
      onClick={() => cycleTask(status)}
      className={`h-[26px] w-[26px] border-2 border-ink ${status.status === 'complete'
          ? 'bg-ink text-white'
          : status.status === 'in_progress'
            ? 'bg-[linear-gradient(to_right,#001A57_50%,#FFFFFF_50%)]'
            : 'bg-white'
        }`}
    >
      {status.status === 'complete' ? <Check size={14} className="mx-auto" /> : null}
    </button>
  )

  const TaskBlock = ({ task, colorClass }) => (
    <div
      key={task.id}
      className={`mb-1.5 flex items-start gap-3 border-y-[1.5px] border-r-[1.5px] border-[#E8E4DC] bg-white px-3.5 py-2.5 ${colorClass}`}
    >
      {renderToggle(task)}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-[13px] font-semibold ${task.status === 'complete' ? 'opacity-50 line-through' : ''}`}>
            {task.title}
          </p>
          {task.is_priority ? <span className="stamp stamp-amber">Priority</span> : null}
        </div>
        {task.details ? <p className="text-[12px] text-[#6B6B6B]">{task.details}</p> : null}
        <p className="mono text-[10px] text-[#6B6B6B]">
          {task.creator_name || 'Unknown'} · {task.created_at ? format(new Date(task.created_at), 'h:mm a') : '--'}
        </p>
      </div>
      {pendingDeleteId === task.id ? (
        <div className="flex items-center gap-1">
          <span className="mono text-[10px] font-bold text-danger">DELETE?</span>
          <button
            type="button"
            className="border border-danger px-1.5 py-0.5 text-[10px] font-bold text-danger"
            onClick={() => confirmDeleteTask(task.id)}
          >
            Yes
          </button>
          <button
            type="button"
            className="text-[10px] text-[#6B6B6B]"
            onClick={() => setPendingDeleteId(null)}
          >
            No
          </button>
        </div>
      ) : (
        <button type="button" className="text-[#6B6B6B]" onClick={() => setPendingDeleteId(task.id)}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )

  const Section = ({ keyName, label, color, tasksInGroup }) => {
    const expanded = expandedSections[keyName]
    return (
      <div className="mb-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 border-b-[2.5px] border-ink py-2.5 text-left"
          onClick={() => toggleSection(keyName)}
        >
          <span className="text-[12px] font-extrabold uppercase" style={{ color }}>
            {label}
          </span>
          <span className="mono ml-auto text-[20px] font-bold" style={{ color }}>
            {tasksInGroup.length}
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expanded ? (
          <div className="pt-2">
            {tasksInGroup.length ? (
              tasksInGroup.map((task) => (
                <TaskBlock
                  key={task.id}
                  task={task}
                  colorClass={`border-l-[3px] ${keyName === 'ongoing'
                      ? 'border-l-primary'
                      : keyName === 'notStarted'
                        ? 'border-l-ink'
                        : 'border-l-[#6B6B6B]'
                    }`}
                />
              ))
            ) : (
              <div className="brutal-card bg-white px-3 py-2 text-[12px] text-[#6B6B6B]">No tasks in this group.</div>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section className="mb-6">
      <div className="mb-3 inline-block bg-ink px-3.5 py-1.5 text-[12px] font-extrabold uppercase text-white">
        Todo List
      </div>
      {loading ? (
        <div>
          {[1, 2, 3].map((row) => (
            <div key={row} className="brutal-card skeleton mb-2 h-16 bg-white" />
          ))}
        </div>
      ) : (
        <div>
          <Section keyName="ongoing" label="ONGOING" color="#0038A7" tasksInGroup={grouped.ongoing} />
          <Section keyName="notStarted" label="NOT STARTED" color="#001A57" tasksInGroup={grouped.notStarted} />
          <Section keyName="complete" label="COMPLETE" color="#6B6B6B" tasksInGroup={grouped.complete} />
        </div>
      )}

      <button
        type="button"
        className="mt-1 text-[12px] font-bold uppercase text-primary"
        onClick={() => setShowAddTask((v) => !v)}
      >
        + Add Task
      </button>
      {showAddTask ? (
        <form onSubmit={submitTask} className="brutal-card mt-2 bg-white p-4">
          <input
            className="brutal-input mb-2"
            placeholder="Task title"
            value={newTask.title}
            onChange={(event) => setNewTask((state) => ({ ...state, title: event.target.value }))}
            required
          />
          <input
            className="brutal-input mb-3"
            placeholder="Task details (optional)"
            value={newTask.details}
            onChange={(event) => setNewTask((state) => ({ ...state, details: event.target.value }))}
          />
          <button
            type="button"
            className="mb-3 flex h-[26px] w-[26px] items-center justify-center border-2 border-ink"
            onClick={() => setNewTask((state) => ({ ...state, is_priority: !state.is_priority }))}
          >
            {newTask.is_priority ? <Check size={14} /> : null}
          </button>
          <button type="submit" className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white">
            Log Task →
          </button>
          <button
            type="button"
            className="mt-2 w-full text-[12px] text-[#6B6B6B]"
            onClick={() => setShowAddTask(false)}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </section>
  )
}
