export const DEFAULT_SHELF_LABELS = ['Bottom Shelf', 'Middle Shelf', 'Top Shelf']

// PO kept for legacy lookup only — P1 Storage now uses PP (avoids looking like "P0").
export const RACK_CODE_PREFIXES = ['JW', 'PP', 'PO', 'MS', 'SV', 'OG']

export const ROOM_RACK_PREFIXES = {
  'Mailroom Storage': 'MS',
  'Joe west linen': 'JW',
  OGH: 'OG',
  'P1 Storage': 'PP',
  SVP: 'SV',
}

/** Old prefix → current prefix (same number space). */
export const LEGACY_RACK_PREFIX_MAP = {
  PO: 'PP',
}

export function canonicalizeRackPrefix(prefix) {
  const value = String(prefix || '')
    .trim()
    .toUpperCase()
    .slice(0, 2)
  return LEGACY_RACK_PREFIX_MAP[value] || value
}

export function canonicalizeRackCode(raw) {
  const normalized = normalizeRackCode(raw)
  if (!normalized || normalized.length < 2) return normalized
  const prefix = canonicalizeRackPrefix(normalized.slice(0, 2))
  return `${prefix}${normalized.slice(2)}`
}

/** Prefixes that share a number space with the given prefix (e.g. PP + legacy PO). */
export function getRelatedRackPrefixes(prefix) {
  const canonical = canonicalizeRackPrefix(prefix)
  const related = new Set([canonical])
  for (const [legacy, current] of Object.entries(LEGACY_RACK_PREFIX_MAP)) {
    if (current === canonical) related.add(legacy)
  }
  return [...related]
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
  if (normalized.includes('p1')) return 'PP'
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
  const safePrefix = canonicalizeRackPrefix(prefix)
  if (!safePrefix) return ''

  const relatedPrefixes = getRelatedRackPrefixes(safePrefix)

  const usedNumbers = new Set(
    (existingCodes || [])
      .map((code) => {
        const normalized = normalizeRackCode(code)
        const codePrefix = normalized.slice(0, 2)
        if (!relatedPrefixes.includes(codePrefix)) return null
        const number = Number(normalized.slice(2))
        return Number.isFinite(number) ? number : null
      })
      .filter((value) => value !== null),
  )

  // Reuse the lowest free number so deleted racks free their codes (JW01, JW02, …).
  let nextNumber = 1
  while (usedNumbers.has(nextNumber) && nextNumber < 100) {
    nextNumber += 1
  }

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
