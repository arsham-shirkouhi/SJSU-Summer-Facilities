import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { deleteTask, getAllTasksForToday, insertTask, updateTaskStatus } from '../lib/queries'

const COLUMN_CONFIG = [
  { key: 'pending', label: 'NOT STARTED', border: 'border-l-danger' },
  { key: 'in_progress', label: 'ONGOING', border: 'border-l-amber' },
  { key: 'complete', label: 'COMPLETED', border: 'border-l-primary' },
]

export default function AdminTodos() {
  const { user, profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', details: '', is_priority: false })
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dragOriginStatus, setDragOriginStatus] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)
  const [dropHandled, setDropHandled] = useState(false)
  const draggingTaskIdRef = useRef(null)
  const dragOriginStatusRef = useRef(null)
  const dropHandledRef = useRef(false)

  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  if (normalizedRole !== 'admin') return <Navigate to="/dashboard" replace />

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
      .channel('admin-todo-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const groupedTasks = useMemo(
    () => ({
      pending: tasks.filter((task) => task.status === 'pending'),
      in_progress: tasks.filter((task) => task.status === 'in_progress'),
      complete: tasks.filter((task) => task.status === 'complete'),
    }),
    [tasks],
  )

  const previewMoveTask = (status) => {
    if (!draggingTaskId || dragOverStatus === status) return
    setDragOverStatus(status)
    setTasks((current) =>
      current.map((task) => (task.id === draggingTaskId ? { ...task, status } : task)),
    )
  }

  const commitMoveTask = async (status) => {
    if (!draggingTaskIdRef.current) return
    const taskId = draggingTaskIdRef.current
    const fromStatus = dragOriginStatusRef.current
    setDropHandled(true)
    dropHandledRef.current = true
    setDragOverStatus(status)
    if (!fromStatus || fromStatus === status) return
    try {
      await updateTaskStatus(taskId, status)
      toast.success('Task moved')
    } catch (error) {
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? { ...task, status: fromStatus } : task)),
      )
      toast.error(error.message || 'Failed to move task')
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
      toast.success('Task added')
    } catch (error) {
      toast.error(error.message || 'Failed to add task')
    }
  }

  const handleDelete = async (task) => {
    const previous = tasks
    setTasks((current) => current.filter((row) => row.id !== task.id))
    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
    } catch (error) {
      setTasks(previous)
      toast.error(error.message || 'Failed to delete task')
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1200px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-4 flex items-center justify-between border-b-[3px] border-ink pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
            <h2 className="text-[24px] font-extrabold">Todo Board</h2>
          </div>
          <button
            type="button"
            className="brutal-btn flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px] text-primary"
            onClick={() => setShowAddTask((open) => !open)}
          >
            <Plus size={14} />
            Add Task
          </button>
        </div>

        {showAddTask ? (
          <form onSubmit={submitTask} className="brutal-card mb-4 bg-white p-4">
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
              className="mb-3 flex h-[28px] w-[28px] items-center justify-center border-2 border-ink"
              onClick={() => setNewTask((state) => ({ ...state, is_priority: !state.is_priority }))}
            >
              {newTask.is_priority ? '!' : null}
            </button>
            <button type="submit" className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white">
              Log Task →
            </button>
          </form>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[1, 2, 3].map((col) => (
              <div key={col} className="brutal-card bg-white p-3">
                <div className="skeleton mb-2 h-5 w-24" />
                {[1, 2, 3].map((row) => (
                  <div key={row} className="skeleton mb-2 h-16 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {COLUMN_CONFIG.map((column) => (
              <div
                key={column.key}
                className={`brutal-card min-h-[360px] bg-white p-3 transition-colors ${
                  dragOverStatus === column.key ? 'bg-primary-light' : ''
                }`}
                onDragOver={(event) => event.preventDefault()}
                onDragEnter={() => previewMoveTask(column.key)}
                onDrop={(event) => {
                  event.preventDefault()
                  void commitMoveTask(column.key)
                }}
              >
                <div className="mb-2 flex items-center justify-between border-b-2 border-ink pb-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">{column.label}</p>
                  <p className="mono text-[20px] font-bold">{groupedTasks[column.key].length}</p>
                </div>
                <div>
                  {groupedTasks[column.key].map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/task-id', task.id)
                        // Keep a full-color drag preview card instead of the default faded ghost.
                        const dragPreview = event.currentTarget.cloneNode(true)
                        dragPreview.style.position = 'fixed'
                        dragPreview.style.top = '-1000px'
                        dragPreview.style.left = '-1000px'
                        dragPreview.style.opacity = '1'
                        dragPreview.style.transform = 'none'
                        dragPreview.style.width = `${event.currentTarget.offsetWidth}px`
                        dragPreview.style.pointerEvents = 'none'
                        document.body.appendChild(dragPreview)
                        event.dataTransfer.setDragImage(dragPreview, 24, 24)
                        requestAnimationFrame(() => {
                          if (dragPreview.parentNode) {
                            dragPreview.parentNode.removeChild(dragPreview)
                          }
                        })
                        setDraggingTaskId(task.id)
                        draggingTaskIdRef.current = task.id
                        setDragOriginStatus(task.status)
                        dragOriginStatusRef.current = task.status
                        setDragOverStatus(task.status)
                        setDropHandled(false)
                        dropHandledRef.current = false
                      }}
                      onDragEnd={() => {
                        if (
                          !dropHandledRef.current &&
                          draggingTaskIdRef.current &&
                          dragOriginStatusRef.current
                        ) {
                          setTasks((current) =>
                            current.map((row) =>
                              row.id === draggingTaskIdRef.current
                                ? { ...row, status: dragOriginStatusRef.current }
                                : row,
                            ),
                          )
                        }
                        setDraggingTaskId(null)
                        draggingTaskIdRef.current = null
                        setDragOriginStatus(null)
                        dragOriginStatusRef.current = null
                        setDragOverStatus(null)
                        setDropHandled(false)
                        dropHandledRef.current = false
                      }}
                      className={`mb-2 cursor-grab border-l-4 border-y-[1.5px] border-r-[1.5px] border-[#E8E4DC] bg-white px-3 py-2 transition-all duration-200 active:cursor-grabbing ${
                        column.border
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <p className={`text-[13px] font-semibold ${task.status === 'complete' ? 'line-through opacity-50' : ''}`}>
                            {task.title}
                          </p>
                          {task.details ? <p className="text-[12px] text-[#6B6B6B]">{task.details}</p> : null}
                          <p className="mono text-[10px] text-[#6B6B6B]">
                            {task.creator_name || 'Unknown'} · {task.created_at ? format(new Date(task.created_at), 'h:mm a') : '--'}
                          </p>
                        </div>
                        <button type="button" className="text-[#6B6B6B]" onClick={() => handleDelete(task)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!groupedTasks[column.key].length ? (
                    <div className="border border-dashed border-[#D6D0C8] px-2 py-3 text-center text-[11px] text-[#8A8378]">
                      Drop tasks here
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <BottomNav role="admin" />
    </div>
  )
}
