export function parseEventNotes(notes) {
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

export function formatEventTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return ''
  if (startTime && endTime) return `${startTime} – ${endTime}`
  return startTime || endTime
}
