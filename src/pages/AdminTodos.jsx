import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import { deleteTask, getAllTasksForToday, insertTask, updateTask, updateTaskStatus } from '../lib/queries'

const COLUMN_CONFIG = [
  { key: 'pending', label: 'NOT STARTED', border: 'border-l-danger' },
  { key: 'in_progress', label: 'ONGOING', border: 'border-l-amber' },
  { key: 'complete', label: 'COMPLETED', border: 'border-l-primary' },
]

const PRIORITY_STYLES = {
  low: { label: 'LOW', className: 'bg-[#E8E4DC] text-[#3D3D3D]' },
  medium: { label: 'MED', className: 'bg-amber-light text-[#7A4A00]' },
  high: { label: 'HIGH', className: 'bg-danger text-white' },
}

const normalizeSubtasks = (rawSubtasks) => {
  if (!Array.isArray(rawSubtasks)) return []
  return rawSubtasks
    .map((subtask, index) => {
      if (typeof subtask === 'string') {
        const text = subtask.trim()
        if (!text) return null
        return { text, done: false }
      }
      if (subtask && typeof subtask === 'object') {
        const text = String(subtask.text || subtask.title || subtask.label || '').trim()
        if (!text) return null
        return {
          text,
          done: Boolean(subtask.done ?? subtask.completed),
        }
      }
      const text = String(subtask || '').trim()
      if (!text) return null
      return { text, done: false, index }
    })
    .filter(Boolean)
}

const normalizeTask = (task) => ({
  ...task,
  subtasks: normalizeSubtasks(task.subtasks),
})

export default function AdminTodos() {
  const { user, profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', details: '', priority: 'medium', subtasks: [] })
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [dragOriginStatus, setDragOriginStatus] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)
  const [dropHandled, setDropHandled] = useState(false)
  const draggingTaskIdRef = useRef(null)
  const dragOriginStatusRef = useRef(null)
  const dropHandledRef = useRef(false)

  const normalizedRole = String(profile?.role || '').trim().toLowerCase()
  const isAdmin = normalizedRole === 'admin'
  const isStaff = normalizedRole === 'staff'
  if (!isAdmin && !isStaff) return <Navigate to="/dashboard" replace />

  const refetchTasks = async () => {
    try {
      setLoading(true)
      const fetched = await getAllTasksForToday()
      setTasks((fetched || []).map(normalizeTask))
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
      toast.success('Task status saved')
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
        subtasks: normalizeSubtasks(newTask.subtasks),
        assigned_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'pending',
        priority: newTask.priority,
        is_priority: newTask.priority === 'high',
        creator_name: profile?.full_name || user?.email || 'Admin',
        created_by: user?.id || null,
      })
      setTasks((current) => [normalizeTask(created), ...current])
      setNewTask({ title: '', details: '', priority: 'medium', subtasks: [] })
      setSubtaskDraft('')
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

  const addDraftSubtask = () => {
    const text = subtaskDraft.trim()
    if (!text) return
    setNewTask((current) => ({
      ...current,
      subtasks: [...current.subtasks, { text, done: false }],
    }))
    setSubtaskDraft('')
  }

  const removeDraftSubtask = (indexToRemove) => {
    setNewTask((current) => ({
      ...current,
      subtasks: current.subtasks.filter((_, index) => index !== indexToRemove),
    }))
  }

  const toggleSubtask = async (task, subtaskIndex) => {
    const previousSubtasks = normalizeSubtasks(task.subtasks)
    const nextSubtasks = previousSubtasks.map((subtask, index) =>
      index === subtaskIndex ? { ...subtask, done: !subtask.done } : subtask,
    )
    setTasks((current) =>
      current.map((row) => (row.id === task.id ? { ...row, subtasks: nextSubtasks } : row)),
    )
    try {
      await updateTask(task.id, { subtasks: nextSubtasks })
    } catch (error) {
      setTasks((current) =>
        current.map((row) => (row.id === task.id ? { ...row, subtasks: previousSubtasks } : row)),
      )
      toast.error(error.message || 'Failed to save subtask')
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="mx-auto min-h-screen w-full max-w-[1200px] bg-cream px-4 pb-20 pt-16 sm:px-6 md:px-8">
        <div className="mb-4 flex items-center justify-between border-b-[3px] border-ink pb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">
              {isAdmin ? 'Admin' : 'Staff'}
            </p>
            <h2 className="text-[24px] font-extrabold">Todo Board</h2>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="brutal-btn flex items-center gap-1.5 bg-white px-3 py-1.5 text-[11px] text-primary"
              onClick={() => setShowAddTask(true)}
            >
              <Plus size={14} />
              Add Task
            </button>
          ) : null}
        </div>

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
                          {(() => {
                            const priorityKey =
                              task.priority || (task.is_priority ? 'high' : 'medium')
                            const priority =
                              PRIORITY_STYLES[priorityKey] || PRIORITY_STYLES.medium
                            return (
                              <span
                                className={`mb-1 inline-flex rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase ${priority.className}`}
                              >
                                {priority.label}
                              </span>
                            )
                          })()}
                          <p className={`text-[13px] font-semibold ${task.status === 'complete' ? 'line-through opacity-50' : ''}`}>
                            {task.title}
                          </p>
                          {task.details ? <p className="text-[12px] text-[#6B6B6B]">{task.details}</p> : null}
                          {task.subtasks?.length ? (
                            <div className="mt-2 space-y-1.5">
                              <p className="mono text-[10px] text-[#6B6B6B]">
                                {task.subtasks.filter((subtask) => subtask.done).length}/{task.subtasks.length} subtasks done
                              </p>
                              {task.subtasks.map((subtask, index) => (
                                <label
                                  key={`${task.id}-subtask-${index}-${subtask.text}`}
                                  className="flex items-center gap-2 text-[11px]"
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(subtask.done)}
                                    onChange={() => toggleSubtask(task, index)}
                                  />
                                  <span className={subtask.done ? 'line-through opacity-60' : ''}>{subtask.text}</span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                          <p className="mono text-[10px] text-[#6B6B6B]">
                            {task.creator_name || 'Unknown'} · {task.created_at ? format(new Date(task.created_at), 'h:mm a') : '--'}
                          </p>
                        </div>
                        {isAdmin ? (
                          <button type="button" className="text-[#6B6B6B]" onClick={() => handleDelete(task)}>
                            <Trash2 size={14} />
                          </button>
                        ) : null}
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
      {showAddTask && isAdmin ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4">
          <div className="brutal-card w-full max-w-[640px] bg-white p-5">
            <div className="mb-3 flex items-center justify-between border-b-[2.5px] border-ink pb-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[#6B6B6B]">Admin</p>
                <p className="text-[18px] font-extrabold uppercase">Add Task</p>
              </div>
              <button
                type="button"
                className="brutal-btn bg-white px-3 py-1.5 text-[11px]"
                onClick={() => setShowAddTask(false)}
              >
                <X size={14} />
              </button>
            </div>
            <form onSubmit={submitTask}>
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
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-bold uppercase">Subtasks</p>
                <div className="flex gap-2">
                  <input
                    className="brutal-input"
                    placeholder="Add subtask"
                    value={subtaskDraft}
                    onChange={(event) => setSubtaskDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addDraftSubtask()
                      }
                    }}
                  />
                  <button type="button" className="brutal-btn bg-white px-3 text-[11px]" onClick={addDraftSubtask}>
                    + Add
                  </button>
                </div>
                {newTask.subtasks.length ? (
                  <div className="mt-2 space-y-1.5">
                    {newTask.subtasks.map((subtask, index) => (
                      <div key={`new-subtask-${index}-${subtask.text}`} className="flex items-center justify-between border border-stone bg-cream px-2 py-1.5">
                        <span className="text-[11px]">{subtask.text}</span>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-danger"
                          onClick={() => removeDraftSubtask(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-bold uppercase">Priority</p>
                <div className="flex gap-2">
                  {['low', 'medium', 'high'].map((priority) => (
                    <label
                      key={priority}
                      className={`cursor-pointer border-2 px-3 py-2 text-[11px] font-bold uppercase ${
                        newTask.priority === priority
                          ? 'border-ink bg-ink text-white'
                          : 'border-ink bg-white text-ink'
                      }`}
                    >
                      <input
                        type="radio"
                        name="priority"
                        value={priority}
                        checked={newTask.priority === priority}
                        onChange={(event) =>
                          setNewTask((state) => ({ ...state, priority: event.target.value }))
                        }
                        className="sr-only"
                      />
                      {priority}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="brutal-btn w-full bg-primary py-2.5 text-[12px] text-white">
                Log Task →
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <BottomNav role={isAdmin ? 'admin' : 'staff'} />
    </div>
  )
}
