export const DEFAULT_SHELF_LABELS = ['Bottom Shelf', 'Middle Shelf', 'Top Shelf']

export const RACK_CODE_PREFIXES = ['JW', 'PO', 'MS', 'SV', 'OG']

export const ROOM_RACK_PREFIXES = {
  'Mailroom Storage': 'MS',
  'Joe west linen': 'JW',
  OGH: 'OG',
  'P1 Storage': 'PO',
  SVP: 'SV',
}

export function getRoomRackPrefix(locationName) {
  if (!locationName) return null
  if (ROOM_RACK_PREFIXES[locationName]) return ROOM_RACK_PREFIXES[locationName]

  const normalized = String(locationName).trim().toLowerCase()
  for (const [roomName, prefix] of Object.entries(ROOM_RACK_PREFIXES)) {
    if (roomName.toLowerCase() === normalized) return prefix
  }

  if (normalized.includes('mailroom')) return 'MS'
  if (normalized.includes('joe')) return 'JW'
  if (normalized.includes('ogh')) return 'OG'
  if (normalized.includes('p1')) return 'PO'
  if (normalized.includes('svp')) return 'SV'

  return null
}

export function getRackDisplayName(rack) {
  return rack?.rack_code || rack?.name || 'Rack'
}

export function normalizeRackCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 4)
}

export function isValidRackCode(raw) {
  const value = normalizeRackCode(raw)
  if (value.length !== 4) return false
  const prefix = value.slice(0, 2)
  const suffix = value.slice(2)
  return RACK_CODE_PREFIXES.includes(prefix) && /^\d{2}$/.test(suffix)
}

export function extractRackCode(raw) {
  if (!raw) return null

  const label = String(raw).trim()
  const direct = normalizeRackCode(label.split(/[·\-–|]/)[0])
  if (isValidRackCode(direct)) return direct

  const normalized = normalizeRackCode(label)
  return isValidRackCode(normalized) ? normalized : null
}

export function formatRackCodeInput(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

export function buildNextRackCode(prefix, existingCodes = []) {
  const safePrefix = String(prefix || '')
    .trim()
    .toUpperCase()
    .slice(0, 2)
  if (!safePrefix) return ''

  const usedNumbers = (existingCodes || [])
    .map((code) => {
      const normalized = normalizeRackCode(code)
      if (!normalized.startsWith(safePrefix)) return null
      const number = Number(normalized.slice(safePrefix.length))
      return Number.isFinite(number) ? number : null
    })
    .filter((value) => value !== null)

  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1
  return `${safePrefix}${String(nextNumber).padStart(2, '0')}`
}

export function getDefaultShelfLabel(level, totalLevels) {
  if (totalLevels === 1) return 'Shelf 1'
  if (level === totalLevels) return 'Top Shelf'
  if (level === 1) return 'Bottom Shelf'
  if (totalLevels === 3 && level === 2) return 'Middle Shelf'
  return `Shelf ${level}`
}

export const ITEM_VISUALS = {
  pillows: { color: '#0038A7', light: '#DCE7FF', emoji: '🛏' },
  blankets: { color: '#92400E', light: '#FEF3C7', emoji: '🧶' },
  pillowcases: { color: '#9333EA', light: '#F3E8FF', emoji: '📦' },
  top_sheets: { color: '#0D9488', light: '#CCFBF1', emoji: '📋' },
  face_towels: { color: '#2563EB', light: '#DBEAFE', emoji: '🧴' },
  body_towels: { color: '#16A34A', light: '#DCFCE7', emoji: '🛁' },
  default: { color: '#475569', light: '#F1F5F9', emoji: '📦' },
}

export function getItemVisual(itemName) {
  const key = String(itemName || '').toLowerCase()
  return ITEM_VISUALS[key] || ITEM_VISUALS.default
}
