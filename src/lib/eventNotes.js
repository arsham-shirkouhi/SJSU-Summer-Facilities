export const EVENT_COLORS = [
  { id: 'navy', label: 'Navy', bg: '#001A57', text: '#FFFFFF', light: '#DCE7FF' },
  { id: 'blue', label: 'Blue', bg: '#2563EB', text: '#FFFFFF', light: '#DBEAFE' },
  { id: 'sky', label: 'Sky', bg: '#0EA5E9', text: '#FFFFFF', light: '#E0F2FE' },
  { id: 'teal', label: 'Teal', bg: '#0D9488', text: '#FFFFFF', light: '#CCFBF1' },
  { id: 'green', label: 'Green', bg: '#16A34A', text: '#FFFFFF', light: '#DCFCE7' },
  { id: 'lime', label: 'Lime', bg: '#84CC16', text: '#1A1A1A', light: '#ECFCCB' },
  { id: 'amber', label: 'Amber', bg: '#F59E0B', text: '#1A1A1A', light: '#FEF3C7' },
  { id: 'orange', label: 'Orange', bg: '#EA580C', text: '#FFFFFF', light: '#FFEDD5' },
  { id: 'red', label: 'Red', bg: '#DC2626', text: '#FFFFFF', light: '#FEE2E2' },
  { id: 'rose', label: 'Rose', bg: '#E11D48', text: '#FFFFFF', light: '#FFE4E6' },
  { id: 'pink', label: 'Pink', bg: '#DB2777', text: '#FFFFFF', light: '#FCE7F3' },
  { id: 'purple', label: 'Purple', bg: '#9333EA', text: '#FFFFFF', light: '#F3E8FF' },
  { id: 'violet', label: 'Violet', bg: '#7C3AED', text: '#FFFFFF', light: '#EDE9FE' },
  { id: 'slate', label: 'Slate', bg: '#475569', text: '#FFFFFF', light: '#F1F5F9' },
  { id: 'brown', label: 'Brown', bg: '#92400E', text: '#FFFFFF', light: '#FEF3C7' },
  { id: 'ink', label: 'Black', bg: '#1A1A1A', text: '#FFFFFF', light: '#E8E4DC' },
]

export const DEFAULT_EVENT_COLOR = 'navy'

export function getEventColor(colorId) {
  return EVENT_COLORS.find((entry) => entry.id === colorId) || EVENT_COLORS[0]
}

export function parseEventNotes(notes) {
  if (!notes) {
    return {
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      color: DEFAULT_EVENT_COLOR,
      startTime: '',
      endTime: '',
    }
  }

  if (typeof notes === 'string' && notes.startsWith('LT_EVENT:')) {
    try {
      const parsed = JSON.parse(notes.slice('LT_EVENT:'.length))
      return {
        title: parsed?.title || '',
        description: parsed?.description || '',
        startDate: parsed?.startDate || '',
        endDate: parsed?.endDate || '',
        color: parsed?.color || DEFAULT_EVENT_COLOR,
        startTime: parsed?.startTime || '',
        endTime: parsed?.endTime || '',
      }
    } catch (_error) {
      return {
        title: String(notes),
        description: '',
        startDate: '',
        endDate: '',
        color: DEFAULT_EVENT_COLOR,
        startTime: '',
        endTime: '',
      }
    }
  }

  return {
    title: String(notes),
    description: '',
    startDate: '',
    endDate: '',
    color: DEFAULT_EVENT_COLOR,
    startTime: '',
    endTime: '',
  }
}

export function serializeEventNotes({
  title,
  description,
  startDate,
  endDate,
  color = DEFAULT_EVENT_COLOR,
}) {
  return `LT_EVENT:${JSON.stringify({
    title,
    description,
    startDate,
    endDate,
    color,
  })}`
}

export function getEventDateRange(entry, fallbackDate = '') {
  const parsed = parseEventNotes(entry?.notes)
  const startDate = parsed.startDate || entry?.pickup_date || fallbackDate
  const endDate = parsed.endDate || parsed.startDate || entry?.pickup_date || fallbackDate
  return {
    startDate,
    endDate: endDate >= startDate ? endDate : startDate,
  }
}

export function eventIsActiveOnDate(entry, dateKey) {
  if (!dateKey) return false
  const { startDate, endDate } = getEventDateRange(entry)
  return startDate <= dateKey && dateKey <= endDate
}

export function formatEventDateRange(startDate, endDate, formatDate = (value) => value) {
  if (!startDate && !endDate) return ''
  if (!startDate) return formatDate(endDate)
  if (!endDate || startDate === endDate) return formatDate(startDate)
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

/** @deprecated Legacy time labels for older saved events */
export function formatEventTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return ''
  if (startTime && endTime) return `${startTime} – ${endTime}`
  return startTime || endTime
}

export function formatEventScheduleLabel(entry, formatDate) {
  const parsed = parseEventNotes(entry?.notes)
  const { startDate, endDate } = getEventDateRange(entry)
  const dateLabel = formatEventDateRange(startDate, endDate, formatDate)
  if (dateLabel) return dateLabel
  return formatEventTimeRange(parsed.startTime, parsed.endTime)
}
