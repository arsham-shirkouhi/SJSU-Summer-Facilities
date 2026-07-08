import { format } from 'date-fns'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'
import { eventIsActiveOnDate, getEventDateRange } from './eventNotes'
import {
  getDefaultShelfLabel,
  getRoomRackPrefix,
  buildNextRackCode,
  normalizeRackCode,
  extractRackCode,
} from './rackCodes'

const todayIso = () => format(new Date(), 'yyyy-MM-dd')
const startOfTodayIso = () => `${todayIso()}T00:00:00`
const endOfTodayIso = () => `${todayIso()}T23:59:59`

const QUERY_TIMEOUT_MS = 12000
const STORAGE_ROOMS_CACHE_MS = 15000
const ACTIVE_SHELVES_CACHE_MS = 30000

let cachedLocations = null
let cachedItems = null
let cachedStorageRooms = null
let cachedStorageRoomsAt = 0
let activeShelfCache = null
let activeShelfCacheAt = 0

export async function withTimeout(promise, ms = QUERY_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timed out')), ms)
  })
  return Promise.race([promise, timeout])
}

function isRpcMissingError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('function') || message.includes('rpc') || message.includes('schema cache')
}

export function clearStorageRoomsCache() {
  cachedStorageRooms = null
  cachedStorageRoomsAt = 0
  activeShelfCache = null
  activeShelfCacheAt = 0
}

export async function getProfile(userId) {
  let roleData = null
  let profileData = null

  const queryAccessRole = async (attempt = 0) => {
    const { data, error } = await withTimeout(
      supabase.from('user_access_roles').select('role').eq('user_id', userId).maybeSingle(),
      6000,
    )
    if (!error) return data
    if (attempt >= 2) return null
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    return queryAccessRole(attempt + 1)
  }

  try {
    const [resolvedRoleData, profileResult] = await Promise.all([
      queryAccessRole(),
      withTimeout(
        supabase
          .from('profiles')
          .select('id,full_name,role,pin_code,contact_email,location_access,is_active,created_at')
          .eq('id', userId)
          .maybeSingle(),
        6000,
      ),
    ])
    roleData = resolvedRoleData
    if (!profileResult.error) profileData = profileResult.data
  } catch (_error) {
    // Ignore fetch errors; fallback profile is used below.
  }

  const effectiveRole = roleData?.role || profileData?.role || 'staff'
  const baseProfile = profileData
    ? { ...profileData, role: effectiveRole }
    : {
      id: userId,
      full_name: 'Staff User',
      role: effectiveRole,
      location_access: null,
      is_active: true,
      created_at: null,
    }

  return {
    ...baseProfile,
    roleFromAccessTable: Boolean(roleData?.role),
  }
}

export async function getAdminMembers() {
  try {
    const { data, error } = await withTimeout(supabase.rpc('admin_list_members'))
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function adminCreateUserAccount({ fullName, pinCode, contactEmail, role }) {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_create_user_account', {
        p_full_name: fullName,
        p_pin_code: pinCode,
        p_contact_email: contactEmail,
        p_role: role,
      }),
      12000,
    )
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  } catch (error) {
    throw error
  }
}

export async function adminUpdateUserAccount({ userId, fullName, pinCode, contactEmail, role }) {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_update_user_account', {
        p_user_id: userId,
        p_full_name: fullName,
        p_pin_code: pinCode,
        p_contact_email: contactEmail,
        p_role: role,
      }),
      12000,
    )
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  } catch (error) {
    throw error
  }
}

export async function adminDeleteUserAccount(pinCode) {
  try {
    const { error } = await withTimeout(
      supabase.rpc('admin_delete_user_account', {
        p_pin_code: pinCode,
      }),
      12000,
    )
    if (error) throw error
  } catch (error) {
    throw error
  }
}

export async function getLocations(options = {}) {
  try {
    const fresh = Boolean(options.fresh)
    if (cachedLocations && !fresh) return cachedLocations
    const { data, error } = await withTimeout(
      supabase
        .from('locations')
        .select('id,name,mode,building,low_threshold,critical_threshold,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(100),
    )
    if (error) throw error
    const rows = data || []
    if (rows.length) cachedLocations = rows
    return rows
  } catch (error) {
    throw error
  }
}

export async function getLocationById(locationId) {
  try {
    if (!locationId) return null
    const { data, error } = await withTimeout(
      supabase
        .from('locations')
        .select('id,name,mode,building,low_threshold,critical_threshold,is_active,created_at')
        .eq('id', locationId)
        .eq('is_active', true)
        .maybeSingle(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export function clearLocationsCache() {
  cachedLocations = null
  clearStorageRoomsCache()
}

async function getActiveShelfIds(force = false) {
  if (
    !force &&
    activeShelfCache &&
    Date.now() - activeShelfCacheAt < ACTIVE_SHELVES_CACHE_MS
  ) {
    return activeShelfCache
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from('shelves').select('id,location_id,is_active').eq('is_active', true).limit(500),
    )
    if (error) throw error
    activeShelfCache = (data || []).map((shelf) => ({
      id: shelf.id,
      location_id: shelf.location_id,
    }))
  } catch (error) {
    if (/is_active|column/.test(error.message || '')) {
      const { data, error: fallbackError } = await withTimeout(
        supabase.from('shelves').select('id,location_id').limit(500),
      )
      if (fallbackError) throw fallbackError
      activeShelfCache = data || []
    } else {
      throw error
    }
  }

  activeShelfCacheAt = Date.now()
  return activeShelfCache
}

async function getActiveShelfBalances(columns = 'location_id,current_balance,updated_at,shelf_id') {
  const shelves = await getActiveShelfIds()
  const shelfIds = shelves.map((shelf) => shelf.id)
  if (!shelfIds.length) return []

  const { data, error } = await withTimeout(
    supabase.from('balances').select(columns).in('shelf_id', shelfIds).limit(5000),
  )
  if (error) throw error
  return data || []
}

async function getStorageRoomsFallback() {
  const [{ data: locations, error: locationsError }, balances, { data: logs, error: logsError }] =
    await Promise.all([
      withTimeout(
        supabase
          .from('locations')
          .select('id,name,building,low_threshold,critical_threshold')
          .eq('is_active', true)
          .eq('mode', 'full')
          .order('created_at', { ascending: true })
          .limit(100),
      ),
      getActiveShelfBalances('location_id,current_balance,updated_at,shelf_id'),
      withTimeout(
        supabase
          .from('log_entries')
          .select('location_id,created_at,staff_name')
          .not('location_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50),
      ),
    ])
  if (locationsError) throw locationsError
  if (logsError) throw logsError

  const totalsByLocation = (balances || []).reduce((acc, row) => {
    if (!row.location_id) return acc
    if (!acc[row.location_id]) {
      acc[row.location_id] = { total: 0, latestUpdate: null }
    }
    acc[row.location_id].total += Number(row.current_balance || 0)
    const updated = row.updated_at ? new Date(row.updated_at) : null
    if (updated && (!acc[row.location_id].latestUpdate || updated > acc[row.location_id].latestUpdate)) {
      acc[row.location_id].latestUpdate = updated
    }
    return acc
  }, {})

  const latestLogByLocation = (logs || []).reduce((acc, log) => {
    if (log.location_id && !acc[log.location_id]) acc[log.location_id] = log
    return acc
  }, {})

  return (locations || []).map((location) => {
    const roomTotals = totalsByLocation[location.id] || { total: 0, latestUpdate: null }
    const latest = latestLogByLocation[location.id]

    return {
      id: location.id,
      name: location.name,
      building: location.building,
      low_threshold: location.low_threshold,
      critical_threshold: location.critical_threshold,
      total_bundles: roomTotals.total,
      last_count_time: latest?.created_at || roomTotals.latestUpdate || null,
      last_count_staff: latest?.staff_name || null,
      item_breakdown: [],
    }
  })
}

export async function getStorageRooms(options = {}) {
  const forceFresh = Boolean(options.fresh)
  if (
    !forceFresh &&
    cachedStorageRooms &&
    Date.now() - cachedStorageRoomsAt < STORAGE_ROOMS_CACHE_MS
  ) {
    return cachedStorageRooms
  }

  try {
    const { data, error } = await withTimeout(supabase.rpc('get_storage_room_summaries'))
    if (!error && Array.isArray(data)) {
      const rows = data.map((location) => ({
        ...location,
        total_bundles: Number(location.total_bundles || 0),
        item_breakdown: [],
      }))
      cachedStorageRooms = rows
      cachedStorageRoomsAt = Date.now()
      return rows
    }
    if (error && !isRpcMissingError(error)) throw error
  } catch (error) {
    if (error.message === 'Request timed out') throw error
  }

  const rows = await getStorageRoomsFallback()
  cachedStorageRooms = rows
  cachedStorageRoomsAt = Date.now()
  return rows
}

export async function getItems(options = {}) {
  try {
    if (!options.fresh && cachedItems) return cachedItems
    const { data, error } = await withTimeout(
      supabase.from('items').select('id,name,label').eq('is_active', true).order('label').limit(100),
    )
    if (error) throw error
    cachedItems = data || []
    return cachedItems
  } catch (error) {
    throw error
  }
}

export function clearItemsCache() {
  cachedItems = null
}

const STANDARD_RACK_ITEM_NAMES = new Set(SETTINGS.rackItems.map((item) => item.key))

export function isCustomInventoryItem(item) {
  if (!item?.name) return false
  return !STANDARD_RACK_ITEM_NAMES.has(item.name)
}

function buildCustomItemName(label, suffix = '') {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const base = slug ? `custom_${slug}` : 'custom_item'
  return suffix ? `${base}_${suffix}` : base
}

export async function createCustomItem(label) {
  const cleanLabel = String(label || '').trim()
  if (!cleanLabel) {
    throw new Error('Item name is required.')
  }
  if (cleanLabel.length > 60) {
    throw new Error('Item name must be 60 characters or less.')
  }

  const reservedLabels = new Set(
    SETTINGS.rackItems.map((item) => String(item.label || '').trim().toLowerCase()),
  )
  if (reservedLabels.has(cleanLabel.toLowerCase())) {
    throw new Error('That name is already used by a standard linen type.')
  }

  const existingItems = await getItems()
  if (
    existingItems.some((item) => String(item.label || '').trim().toLowerCase() === cleanLabel.toLowerCase())
  ) {
    throw new Error('An item with that name already exists.')
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = buildCustomItemName(cleanLabel, attempt ? String(attempt) : '')
    const { data, error } = await withTimeout(
      supabase
        .from('items')
        .insert({
          name,
          label: cleanLabel,
          is_active: true,
        })
        .select('id,name,label')
        .single(),
    )

    if (!error) {
      clearItemsCache()
      return data
    }
    if (error.code === '42501' || /policy|permission|row-level security/i.test(error.message || '')) {
      throw new Error(
        'Could not save custom item to the database. Run migration 018_custom_items.sql in Supabase.',
      )
    }
    if (error.code !== '23505') throw error
  }

  throw new Error('Could not create that custom item. Try a different name.')
}

export async function getRackItems(options = {}) {
  const allItems = await getItems(options)
  const byName = Object.fromEntries(allItems.map((item) => [item.name, item]))
  const standard = SETTINGS.rackItems.map((config) => byName[config.key]).filter(Boolean)
  const standardNames = new Set(SETTINGS.rackItems.map((config) => config.key))
  const custom = allItems.filter((item) => !standardNames.has(item.name))
  return [...standard, ...custom]
}

export async function getShelvesByRoom(locationId) {
  try {
    let shelvesQuery = supabase
      .from('shelves')
      .select('id,name,qr_slug')
      .eq('location_id', locationId)
      .order('name', { ascending: true })
      .limit(100)

    let { data: shelves, error: shelvesError } = await withTimeout(shelvesQuery.eq('is_active', true))
    if (shelvesError && /is_active|column/.test(shelvesError.message || '')) {
      ; ({ data: shelves, error: shelvesError } = await withTimeout(shelvesQuery))
    }
    if (shelvesError) throw shelvesError

    const shelfIds = (shelves || []).map((shelf) => shelf.id)
    if (!shelfIds.length) return []

    const shelfItemsPromise = withTimeout(
      supabase
        .from('shelf_items')
        .select('shelf_id,sort_order,is_active,item_id,items(id,name,label)')
        .in('shelf_id', shelfIds),
    ).catch((error) => {
      if (/shelf_items|relationship/.test(error.message || '')) {
        return { data: [], error: null }
      }
      throw error
    })

    const [shelfItemsResult, balancesResult] = await Promise.all([
      shelfItemsPromise,
      withTimeout(
        supabase
          .from('balances')
          .select('id,shelf_id,current_balance,updated_at,item_id,items(id,name,label)')
          .eq('location_id', locationId),
      ),
    ])

    if (balancesResult.error) throw balancesResult.error
    if (shelfItemsResult.error) throw shelfItemsResult.error

    const shelfItemsByShelf = (shelfItemsResult.data || []).reduce((acc, row) => {
      if (!acc[row.shelf_id]) acc[row.shelf_id] = []
      acc[row.shelf_id].push(row)
      return acc
    }, {})

    const balancesByShelf = (balancesResult.data || []).reduce((acc, row) => {
      if (!acc[row.shelf_id]) acc[row.shelf_id] = []
      acc[row.shelf_id].push(row)
      return acc
    }, {})

    return (shelves || []).map((shelf) => ({
      ...shelf,
      shelf_items: shelfItemsByShelf[shelf.id] || [],
      balances: balancesByShelf[shelf.id] || [],
    }))
  } catch (error) {
    throw error
  }
}

export async function getShelfByCode(code) {
  const rackUnit = await getRackUnitByCode(code)
  if (!rackUnit) return null

  const primaryShelf = rackUnit.shelves?.[0]
  if (!primaryShelf) return null

  return {
    shelfId: primaryShelf.id,
    roomId: rackUnit.roomId,
    name: rackUnit.name,
    qrSlug: rackUnit.rack_code || '',
    rackUnitId: rackUnit.rackUnitId,
    rackCode: rackUnit.rack_code,
  }
}

function buildShelfRows(shelf) {
  const balanceByItemId = new Map(
    (shelf.balances || []).map((balance) => [
      balance.item_id,
      {
        id: balance.id,
        current_balance: Number(balance.current_balance || 0),
        updated_at: balance.updated_at || null,
      },
    ]),
  )

  const configuredItems = (shelf.shelf_items || [])
    .filter((entry) => entry.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((entry) => ({
      item_id: entry.item_id,
      item_name: entry.items?.name || '',
      item_label: entry.items?.label || entry.items?.name || 'Item',
    }))

  const rows = configuredItems.map((item) => {
    const balance = balanceByItemId.get(item.item_id)
    return {
      ...item,
      current_balance: Number(balance?.current_balance || 0),
      updated_at: balance?.updated_at || null,
    }
  })

  return {
    id: shelf.id,
    name: shelf.name,
    shelf_level: Number(shelf.shelf_level || 1),
    shelf_label: shelf.shelf_label || getDefaultShelfLabel(Number(shelf.shelf_level || 1), 1),
    rows,
  }
}

const LEGACY_SHELF_SELECT = 'id,name,qr_slug,location_id'
const FULL_SHELF_SELECT = `${LEGACY_SHELF_SELECT},rack_unit_id,shelf_level,shelf_label`

function isMissingRackUnitColumnError(error) {
  const message = String(error?.message || '').toLowerCase()
  return /rack_unit_id|shelf_level|shelf_label|rack_units|relation|schema cache/.test(message)
}

async function attachShelfItemsAndBalances(shelves, locationId) {
  const shelfIds = (shelves || []).map((shelf) => shelf.id)
  if (!shelfIds.length) return []

  const shelfItemsPromise = withTimeout(
    supabase
      .from('shelf_items')
      .select('shelf_id,sort_order,is_active,item_id,items(id,name,label)')
      .in('shelf_id', shelfIds),
  ).catch((error) => {
    if (/shelf_items|relationship/.test(error.message || '')) {
      return { data: [], error: null }
    }
    throw error
  })

  const [shelfItemsResult, balancesResult] = await Promise.all([
    shelfItemsPromise,
    withTimeout(
      supabase
        .from('balances')
        .select('id,shelf_id,current_balance,updated_at,item_id,items(id,name,label)')
        .eq('location_id', locationId)
        .in('shelf_id', shelfIds),
    ),
  ])

  if (balancesResult.error) throw balancesResult.error
  if (shelfItemsResult.error) throw shelfItemsResult.error

  const shelfItemsByShelf = (shelfItemsResult.data || []).reduce((acc, row) => {
    if (!acc[row.shelf_id]) acc[row.shelf_id] = []
    acc[row.shelf_id].push(row)
    return acc
  }, {})

  const balancesByShelf = (balancesResult.data || []).reduce((acc, row) => {
    if (!acc[row.shelf_id]) acc[row.shelf_id] = []
    acc[row.shelf_id].push(row)
    return acc
  }, {})

  return (shelves || []).map((shelf) => ({
    ...shelf,
    shelf_items: shelfItemsByShelf[shelf.id] || [],
    balances: balancesByShelf[shelf.id] || [],
  }))
}

async function queryShelvesByLocationPrefix(locationId, prefix, select = FULL_SHELF_SELECT) {
  const runQuery = (fields, activeOnly) => {
    let query = supabase
      .from('shelves')
      .select(fields)
      .eq('location_id', locationId)
      .ilike('name', `${prefix}%`)
      .order('name', { ascending: true })
      .limit(20)
    if (activeOnly) query = query.eq('is_active', true)
    return withTimeout(query)
  }

  let { data, error } = await runQuery(select, true)
  if (error && /is_active|column|rack_unit_id|shelf_level|shelf_label/.test(error.message || '')) {
    ;({ data, error } = await runQuery(select, false))
  }
  if (error && /column|rack_unit_id|shelf_level|shelf_label/.test(error.message || '')) {
    ;({ data, error } = await runQuery(LEGACY_SHELF_SELECT, true))
  }
  if (error && /is_active|column/.test(error.message || '')) {
    ;({ data, error } = await runQuery(LEGACY_SHELF_SELECT, false))
  }
  if (error) throw error
  return data || []
}

async function fetchShelvesForRackCode(locationId, rackCode) {
  if (!locationId || !rackCode) return []

  const prefix = rackCode.slice(0, 2)
  const shelves = await queryShelvesByLocationPrefix(locationId, prefix)
  const matched = shelves.filter((shelf) => extractRackCode(shelf.name) === rackCode)
  if (!matched.length) return []

  return attachShelfItemsAndBalances(matched, locationId)
}

async function fetchRackUnitShelves(rackUnitId, locationId, rackCode = null) {
  if (!locationId) return []

  if (rackUnitId) {
    let shelvesQuery = supabase
      .from('shelves')
      .select('id,name,rack_unit_id,shelf_level,shelf_label,qr_slug')
      .eq('rack_unit_id', rackUnitId)
      .order('shelf_level', { ascending: true })
      .limit(20)

    let { data: shelves, error: shelvesError } = await withTimeout(shelvesQuery.eq('is_active', true))
    if (shelvesError && /is_active|column|rack_unit_id|relationship/.test(shelvesError.message || '')) {
      ;({ data: shelves, error: shelvesError } = await withTimeout(shelvesQuery))
    }

    if (!shelvesError && shelves?.length) {
      return attachShelfItemsAndBalances(shelves, locationId)
    }

    if (shelvesError && !isMissingRackUnitColumnError(shelvesError)) {
      throw shelvesError
    }
  }

  let code = rackCode
  if (!code && rackUnitId) {
    const { data: unit } = await withTimeout(
      supabase.from('rack_units').select('rack_code,name').eq('id', rackUnitId).maybeSingle(),
    ).catch(() => ({ data: null }))
    code = extractRackCode(unit?.rack_code) || extractRackCode(unit?.name)
  }

  if (code) {
    return fetchShelvesForRackCode(locationId, code)
  }

  return []
}

async function buildRackUnitByCodeResponse(rackUnit, rackCode) {
  const resolvedCode = rackCode || extractRackCode(rackUnit.rack_code) || extractRackCode(rackUnit.name)
  const rawShelves = await fetchRackUnitShelves(rackUnit.id, rackUnit.location_id, resolvedCode)
  const shelves = rawShelves.map((shelf) => {
    const totalLevels = rawShelves.length || 1
    return buildShelfRows({
      ...shelf,
      shelf_label: shelf.shelf_label || getDefaultShelfLabel(Number(shelf.shelf_level || 1), totalLevels),
    })
  })

  return {
    rackUnitId: rackUnit.id,
    name: rackUnit.name,
    rack_code: rackUnit.rack_code || rackCode,
    roomId: rackUnit.location_id,
    roomName: rackUnit.locations?.name || '',
    shelves: shelves.sort((a, b) => Number(b.shelf_level) - Number(a.shelf_level)),
  }
}

async function findRackUnitRecordByCode(rackCode) {
  if (!rackCode) return null

  const prefix = rackCode.slice(0, 2)

  try {
    const { data: byCode, error: codeError } = await withTimeout(
      supabase
        .from('rack_units')
        .select('id,name,rack_code,location_id,locations(id,name)')
        .eq('is_active', true)
        .ilike('rack_code', rackCode)
        .maybeSingle(),
    )

    if (codeError) {
      if (/rack_units|relation|schema cache/.test(codeError.message || '')) return null
      throw codeError
    }
    if (byCode?.id) return byCode

    const { data: candidates, error: candidatesError } = await withTimeout(
      supabase
        .from('rack_units')
        .select('id,name,rack_code,location_id,locations(id,name)')
        .eq('is_active', true)
        .or(`rack_code.ilike.${prefix}%,name.ilike.${prefix}%`),
    )

    if (candidatesError) {
      if (/rack_units|relation|schema cache/.test(candidatesError.message || '')) return null
      throw candidatesError
    }

    return (
      (candidates || []).find(
        (unit) =>
          extractRackCode(unit.rack_code) === rackCode || extractRackCode(unit.name) === rackCode,
      ) || null
    )
  } catch (_error) {
    return null
  }
}

async function findShelfRecordByRackCode(rackCode) {
  if (!rackCode) return null

  const prefix = rackCode.slice(0, 2)
  const runGlobalQuery = (select, activeOnly) => {
    let query = supabase.from('shelves').select(select).ilike('name', `${prefix}%`).limit(100)
    if (activeOnly) query = query.eq('is_active', true)
    return withTimeout(query)
  }

  let { data: shelves, error } = await runGlobalQuery(FULL_SHELF_SELECT, true)
  if (error && /is_active|column|rack_unit_id|shelf_level|shelf_label/.test(error.message || '')) {
    ;({ data: shelves, error } = await runGlobalQuery(FULL_SHELF_SELECT, false))
  }
  if (error && /column|rack_unit_id|shelf_level|shelf_label/.test(error.message || '')) {
    ;({ data: shelves, error } = await runGlobalQuery(LEGACY_SHELF_SELECT, true))
  }
  if (error && /is_active|column/.test(error.message || '')) {
    ;({ data: shelves, error } = await runGlobalQuery(LEGACY_SHELF_SELECT, false))
  }
  if (error) throw error

  return (shelves || []).find((shelf) => extractRackCode(shelf.name) === rackCode) || null
}

async function getLegacyShelfByCode(rawCode) {
  const rackCode = normalizeRackCode(rawCode)
  if (!rackCode) return null

  const matchedShelf = await findShelfRecordByRackCode(rackCode).catch(() => null)
  if (matchedShelf?.id && matchedShelf.location_id) {
    const { data: location } = await withTimeout(
      supabase.from('locations').select('id,name').eq('id', matchedShelf.location_id).maybeSingle(),
    )

    const rackUnit = await findRackUnitRecordByCode(rackCode)
    if (rackUnit?.id) {
      if (!rackUnit.rack_code) {
        await withTimeout(
          supabase.from('rack_units').update({ rack_code: rackCode, name: rackCode }).eq('id', rackUnit.id),
        ).catch(() => {})
        rackUnit.rack_code = rackCode
        rackUnit.name = rackCode
      }
      return buildRackUnitByCodeResponse(rackUnit, rackCode)
    }

    const shelves = await fetchShelvesForRackCode(matchedShelf.location_id, rackCode).catch(async () => {
      const [shelfItemsResult, balancesResult] = await Promise.all([
        withTimeout(
          supabase
            .from('shelf_items')
            .select('shelf_id,sort_order,is_active,item_id,items(id,name,label)')
            .eq('shelf_id', matchedShelf.id),
        ).catch(() => ({ data: [] })),
        withTimeout(
          supabase
            .from('balances')
            .select('id,shelf_id,current_balance,updated_at,item_id,items(id,name,label)')
            .eq('shelf_id', matchedShelf.id),
        ),
      ])

      return [
        {
          ...matchedShelf,
          shelf_items: shelfItemsResult.data || [],
          balances: balancesResult.data || [],
        },
      ]
    })

    const normalizedShelves = (shelves?.length ? shelves : [matchedShelf]).map((shelf, index, all) =>
      buildShelfRows({
        ...shelf,
        shelf_level: shelf.shelf_level || all.length - index,
        shelf_label:
          shelf.shelf_label ||
          getDefaultShelfLabel(Number(shelf.shelf_level || all.length - index), all.length || 1),
        shelf_items: shelf.shelf_items || [],
        balances: shelf.balances || [],
      }),
    )

    return {
      rackUnitId: matchedShelf.rack_unit_id || matchedShelf.id,
      name: rackCode,
      rack_code: rackCode,
      roomId: matchedShelf.location_id,
      roomName: location?.name || '',
      shelves: normalizedShelves.sort((a, b) => Number(b.shelf_level) - Number(a.shelf_level)),
    }
  }

  const normalizedSlug = String(rawCode || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  if (!normalizedSlug) return null

  let { data, error } = await withTimeout(
    supabase
      .from('shelves')
      .select(FULL_SHELF_SELECT)
      .eq('qr_slug', normalizedSlug)
      .maybeSingle(),
  )
  if (error && /column|rack_unit_id|shelf_level|shelf_label/.test(error.message || '')) {
    ;({ data, error } = await withTimeout(
      supabase.from('shelves').select(LEGACY_SHELF_SELECT).eq('qr_slug', normalizedSlug).maybeSingle(),
    ))
  }
  if (error) throw error
  if (!data?.id || !data.location_id) return null

  const { data: location } = await withTimeout(
    supabase.from('locations').select('id,name').eq('id', data.location_id).maybeSingle(),
  )

  const codeFromShelf = extractRackCode(data.name) || rackCode
  const shelves = await fetchRackUnitShelves(data.rack_unit_id, data.location_id, codeFromShelf).catch(
    async () => {
      const [shelfItemsResult, balancesResult] = await Promise.all([
        withTimeout(
          supabase
            .from('shelf_items')
            .select('shelf_id,sort_order,is_active,item_id,items(id,name,label)')
            .eq('shelf_id', data.id),
        ).catch(() => ({ data: [] })),
        withTimeout(
          supabase
            .from('balances')
            .select('id,shelf_id,current_balance,updated_at,item_id,items(id,name,label)')
            .eq('shelf_id', data.id),
        ),
      ])

      return [
        {
          ...data,
          shelf_items: shelfItemsResult.data || [],
          balances: balancesResult.data || [],
        },
      ]
    },
  )

  const normalizedShelves = (shelves?.length ? shelves : [data]).map((shelf, index, all) =>
    buildShelfRows({
      ...shelf,
      shelf_level: shelf.shelf_level || all.length - index,
      shelf_label:
        shelf.shelf_label ||
        getDefaultShelfLabel(Number(shelf.shelf_level || all.length - index), all.length || 1),
      shelf_items: shelf.shelf_items || [],
      balances: shelf.balances || [],
    }),
  )

  return {
    rackUnitId: data.rack_unit_id || data.id,
    name: data.name,
    rack_code: codeFromShelf,
    roomId: data.location_id,
    roomName: location?.name || '',
    shelves: normalizedShelves.sort((a, b) => Number(b.shelf_level) - Number(a.shelf_level)),
  }
}

export async function getRackUnitByCode(rawCode) {
  const rackCode = normalizeRackCode(rawCode)
  if (!rackCode) return null

  try {
    const rackUnit = await findRackUnitRecordByCode(rackCode)

    if (!rackUnit?.id) {
      return getLegacyShelfByCode(rawCode)
    }

    if (!rackUnit.rack_code) {
      await withTimeout(
        supabase.from('rack_units').update({ rack_code: rackCode, name: rackCode }).eq('id', rackUnit.id),
      )
      rackUnit.rack_code = rackCode
      rackUnit.name = rackCode
    }

    return buildRackUnitByCodeResponse(rackUnit, rackCode)
  } catch (error) {
    if (isMissingRackUnitColumnError(error)) {
      return getLegacyShelfByCode(rawCode)
    }
    throw error
  }
}

async function fetchRackCodesForPrefix(prefix) {
  if (!prefix) return []

  const codes = new Set()

  try {
    const [{ data: units, error: unitsError }, shelvesResult] = await Promise.all([
        withTimeout(
          supabase
            .from('rack_units')
            .select('rack_code,name')
            .eq('is_active', true)
            .or(`rack_code.ilike.${prefix}%,name.ilike.${prefix}%`),
        ),
        withTimeout(
          supabase.from('shelves').select('name').eq('is_active', true).ilike('name', `${prefix}%`),
        ).catch(() => ({ data: null, error: null })),
      ])

    let shelves = shelvesResult?.data
    const shelvesError = shelvesResult?.error
    if (shelvesError && /is_active|column/.test(shelvesError.message || '')) {
      const fallback = await withTimeout(
        supabase.from('shelves').select('name').ilike('name', `${prefix}%`),
      ).catch(() => ({ data: null, error: shelvesError }))
      shelves = fallback?.data
    }

    if (unitsError) {
      if (!/rack_units|relation|schema cache/.test(unitsError.message || '')) {
        throw unitsError
      }
    } else {
      for (const row of units || []) {
        const code = extractRackCode(row.rack_code) || extractRackCode(row.name)
        if (code) codes.add(code)
      }
    }

    if (shelves?.length) {
      for (const row of shelves) {
        const code = extractRackCode(row.name)
        if (code) codes.add(code)
      }
    }
  } catch (_error) {
    return []
  }

  return [...codes]
}

export async function getNextRackCodeForRoom(locationName, locationId = null) {
  const prefix = getRoomRackPrefix(locationName)
  if (!prefix) {
    throw new Error(`No rack code prefix configured for ${locationName || 'this room'}.`)
  }

  if (locationId) {
    await assignMissingRackCodes(locationId, locationName)
  }

  const existingCodes = await fetchRackCodesForPrefix(prefix)
  return buildNextRackCode(prefix, existingCodes)
}

async function assignMissingRackCodes(locationId, locationName) {
  const prefix = getRoomRackPrefix(locationName)
  if (!prefix) return

  try {
    const [{ data: roomUnits, error: roomError }, existingCodes] = await Promise.all([
      withTimeout(
        supabase
          .from('rack_units')
          .select('id,name,rack_code,created_at')
          .eq('location_id', locationId)
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
      ),
      fetchRackCodesForPrefix(prefix),
    ])

    if (roomError) {
      if (/rack_units|relation|schema cache/.test(roomError.message || '')) return
      throw roomError
    }

    const usedCodes = new Set(existingCodes)
    for (const unit of roomUnits || []) {
      if (unit.rack_code) {
        usedCodes.add(normalizeRackCode(unit.rack_code))
        if (unit.name !== unit.rack_code) {
          await withTimeout(
            supabase.from('rack_units').update({ name: unit.rack_code }).eq('id', unit.id),
          )
        }
        continue
      }

      const codeFromName = extractRackCode(unit.name)
      if (codeFromName) {
        const { error: updateError } = await withTimeout(
          supabase
            .from('rack_units')
            .update({ rack_code: codeFromName, name: codeFromName })
            .eq('id', unit.id),
        )
        if (updateError) throw updateError
        usedCodes.add(codeFromName)
        continue
      }

      const nextCode = buildNextRackCode(prefix, [...usedCodes])
      const { error: updateError } = await withTimeout(
        supabase.from('rack_units').update({ rack_code: nextCode, name: nextCode }).eq('id', unit.id),
      )
      if (updateError) throw updateError
      usedCodes.add(nextCode)
    }
  } catch (_error) {
    // Ignore when rack_units is not available yet.
  }
}

async function allocateNextRackCode(locationName, locationId = null) {
  return getNextRackCodeForRoom(locationName, locationId)
}

const buildQrSlug = (locationName, rackName) => {
  const base = `${locationName || 'room'}-${rackName || 'rack'}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.slice(0, 80) || `rack-${crypto.randomUUID().slice(0, 8)}`
}

async function syncLocationLinenTotalsFromBalances(locationId) {
  if (!locationId) return

  const rows = await getActiveShelfBalances('current_balance,location_id,items(name,label)')
  const balances = rows.filter((row) => row.location_id === locationId)

  const totals = {
    linen: 0,
    face_hand_towel: 0,
    body_towel: 0,
    pillow_case: 0,
  }

  for (const row of balances) {
    const column = resolveLocationTotalColumn(row.items?.name, row.items?.label)
    if (column) totals[column] += Number(row.current_balance || 0)
  }

  const { data: totalRow, error: fetchError } = await withTimeout(
    supabase.from('location_linen_totals').select('id').eq('location_id', locationId).maybeSingle(),
  )
  if (fetchError) throw fetchError

  const payload = { ...totals, updated_at: new Date().toISOString() }

  if (totalRow?.id) {
    const { error } = await withTimeout(
      supabase.from('location_linen_totals').update(payload).eq('id', totalRow.id),
    )
    if (error) throw error
  } else {
    const { error } = await withTimeout(
      supabase.from('location_linen_totals').insert({ location_id: locationId, ...totals }),
    )
    if (error) throw error
  }
}

export async function getStorageRoomsWithRackCounts() {
  try {
    const [{ data: locations, error: locationsError }, { data: shelves, error: shelvesError }] =
      await Promise.all([
        withTimeout(
          supabase
            .from('locations')
            .select('id,name,building')
            .eq('is_active', true)
            .eq('mode', 'full')
            .order('name', { ascending: true })
            .limit(100),
        ),
        withTimeout(
          supabase.from('shelves').select('id,location_id').eq('is_active', true).limit(500),
        ),
      ])
    if (locationsError) throw locationsError
    if (shelvesError) throw shelvesError

    const rackCountByLocation = (shelves || []).reduce((acc, shelf) => {
      acc[shelf.location_id] = (acc[shelf.location_id] || 0) + 1
      return acc
    }, {})

    return (locations || []).map((location) => ({
      ...location,
      rack_count: rackCountByLocation[location.id] || 0,
    }))
  } catch (error) {
    throw error
  }
}

export async function getAdminRoomRacks(locationId) {
  try {
    const { data: location } = await withTimeout(
      supabase.from('locations').select('name').eq('id', locationId).maybeSingle(),
    )
    await assignMissingRackCodes(locationId, location?.name)

    const { data: rackUnits, error: rackUnitsError } = await withTimeout(
      supabase
        .from('rack_units')
        .select('id,name,rack_code,created_at,location_id')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(100),
    )

    if (rackUnitsError) {
      if (!/rack_units|relation|schema cache/.test(rackUnitsError.message || '')) {
        throw rackUnitsError
      }
      return getAdminRoomRacksLegacy(locationId)
    }

    const units = await Promise.all(
      (rackUnits || []).map(async (unit) => {
        const resolvedCode = extractRackCode(unit.rack_code) || extractRackCode(unit.name)
        const shelves = await fetchRackUnitShelves(unit.id, locationId, resolvedCode)
        const primaryShelf = shelves[0] || null
        return {
          id: unit.id,
          rack_unit_id: unit.id,
          primary_shelf_id: primaryShelf?.id || null,
          name: unit.name,
          rack_code: unit.rack_code,
          qr_slug: unit.rack_code || primaryShelf?.qr_slug || null,
          created_at: unit.created_at,
          shelves,
          shelf_items: primaryShelf?.shelf_items || [],
          balances: shelves.flatMap((shelf) => shelf.balances || []),
        }
      }),
    )

    return units
  } catch (error) {
    if (isMissingRackUnitColumnError(error)) {
      return getAdminRoomRacksLegacy(locationId)
    }
    throw error
  }
}

async function getAdminRoomRacksLegacy(locationId) {
  const baseQuery = () =>
    supabase
      .from('shelves')
      .select(
        'id,name,qr_slug,created_at,shelf_items(sort_order,is_active,item_id,items(id,name,label)),balances(current_balance,item_id)',
      )
      .eq('location_id', locationId)
      .order('name', { ascending: true })
      .limit(100)

  let { data, error } = await withTimeout(baseQuery().eq('is_active', true))
  if (error && /is_active|column/.test(error.message || '')) {
    ; ({ data, error } = await withTimeout(baseQuery()))
  }
  if (error && /shelf_items|relationship/.test(error.message || '')) {
    ; ({ data, error } = await withTimeout(
      supabase
        .from('shelves')
        .select('id,name,qr_slug,created_at,balances(current_balance,item_id)')
        .eq('location_id', locationId)
        .order('name', { ascending: true })
        .limit(100),
    ))
    data = (data || []).map((shelf) => ({ ...shelf, shelf_items: [] }))
  }
  if (error) throw error
  return (data || []).map((shelf) => ({
    ...shelf,
    rack_unit_id: shelf.id,
    primary_shelf_id: shelf.id,
    rack_code: null,
    shelves: [shelf],
  }))
}

export async function createRack({
  locationId,
  locationName,
  itemIds = [],
  shelfCount = 3,
}) {
  try {
    if (!locationId) {
      throw new Error('Room is required.')
    }

    const totalShelves = Math.max(1, Math.min(Number(shelfCount) || 3, 5))

    try {
      const normalizedCode = await allocateNextRackCode(locationName, locationId)
      if (!normalizedCode) {
        throw new Error(`Could not generate a rack code for ${locationName || 'this room'}.`)
      }

      const { data: rackUnit, error: rackUnitError } = await withTimeout(
        supabase
          .from('rack_units')
          .insert({
            location_id: locationId,
            name: normalizedCode,
            rack_code: normalizedCode,
          })
          .select('id,name,rack_code,location_id,created_at')
          .single(),
      )

      if (rackUnitError) {
        if (rackUnitError.code === '23505') {
          throw new Error('That rack code is already in use.')
        }
        throw rackUnitError
      }

      const createdShelves = []
      for (let level = 1; level <= totalShelves; level += 1) {
        const shelfLabel = getDefaultShelfLabel(level, totalShelves)
        const qrSlug = buildQrSlug(locationName, `${normalizedCode}-${shelfLabel}`)
        const fullPayload = {
          location_id: locationId,
          name: `${normalizedCode} · ${shelfLabel}`,
          qr_slug: qrSlug,
          rack_unit_id: rackUnit.id,
          shelf_level: level,
          shelf_label: shelfLabel,
        }
        const legacyPayload = {
          location_id: locationId,
          name: `${normalizedCode} · ${shelfLabel}`,
          qr_slug: qrSlug,
        }

        let { data: shelf, error: shelfError } = await withTimeout(
          supabase
            .from('shelves')
            .insert(fullPayload)
            .select('id,name,qr_slug,location_id,created_at,rack_unit_id,shelf_level,shelf_label')
            .single(),
        )
        if (shelfError && /rack_unit_id|shelf_level|shelf_label|column/.test(shelfError.message || '')) {
          ;({ data: shelf, error: shelfError } = await withTimeout(
            supabase
              .from('shelves')
              .insert(legacyPayload)
              .select('id,name,qr_slug,location_id,created_at')
              .single(),
          ))
        }
        if (shelfError) throw shelfError
        await setRackItems({ shelfId: shelf.id, itemIds })
        createdShelves.push(shelf)
      }

      clearStorageRoomsCache()
      return {
        ...rackUnit,
        shelves: createdShelves,
        primary_shelf_id: createdShelves[0]?.id || null,
      }
    } catch (unitError) {
      if (!/rack_units|relation|schema cache|rack_unit_id|column/.test(unitError.message || '')) {
        throw unitError
      }
    }

    let qrSlug = buildQrSlug(locationName, `rack-${crypto.randomUUID().slice(0, 8)}`)
    const legacyName =
      normalizeRackCode(await allocateNextRackCode(locationName, locationId).catch(() => '')) || 'Rack'
    const { data: shelf, error: shelfError } = await withTimeout(
      supabase
        .from('shelves')
        .insert({
          location_id: locationId,
          name: legacyName,
          qr_slug: qrSlug,
        })
        .select('id,name,qr_slug,location_id,created_at')
        .single(),
    )

    if (shelfError) {
      if (shelfError.code === '23505') {
        qrSlug = `${qrSlug}-${crypto.randomUUID().slice(0, 6)}`
        const { data: retryShelf, error: retryError } = await withTimeout(
          supabase
            .from('shelves')
            .insert({
              location_id: locationId,
              name: legacyName,
              qr_slug: qrSlug,
            })
            .select('id,name,qr_slug,location_id,created_at')
            .single(),
        )
        if (retryError) throw retryError
        return finalizeRackItems(retryShelf, itemIds)
      }
      throw shelfError
    }

    return finalizeRackItems(shelf, itemIds)
  } catch (error) {
    throw error
  }
}

async function finalizeRackItems(shelf, itemIds) {
  await setRackItems({ shelfId: shelf.id, itemIds })
  return shelf
}

export async function setRackItems({ shelfId, itemIds = [] }) {
  const uniqueItemIds = [...new Set((itemIds || []).filter(Boolean))]

  const { data: existing, error: fetchError } = await withTimeout(
    supabase.from('shelf_items').select('id,item_id,is_active').eq('shelf_id', shelfId),
  )
  if (fetchError) throw fetchError

  const existingByItem = new Map((existing || []).map((row) => [row.item_id, row]))
  const targetSet = new Set(uniqueItemIds)

  for (const row of existing || []) {
    if (!targetSet.has(row.item_id) && row.is_active !== false) {
      const { error } = await withTimeout(
        supabase.from('shelf_items').update({ is_active: false }).eq('id', row.id),
      )
      if (error) throw error
    }
  }

  for (let index = 0; index < uniqueItemIds.length; index += 1) {
    const itemId = uniqueItemIds[index]
    const row = existingByItem.get(itemId)
    if (row) {
      const { error } = await withTimeout(
        supabase
          .from('shelf_items')
          .update({ is_active: true, sort_order: index + 1 })
          .eq('id', row.id),
      )
      if (error) throw error
    } else {
      const { error } = await withTimeout(
        supabase.from('shelf_items').insert({
          shelf_id: shelfId,
          item_id: itemId,
          sort_order: index + 1,
        }),
      )
      if (error) throw error
    }
  }
}

async function getShelfIdsForRackUnit(rackUnitId) {
  let { data: shelves, error } = await withTimeout(
    supabase.from('shelves').select('id,location_id').eq('rack_unit_id', rackUnitId).eq('is_active', true),
  )
  if (error && /is_active|column|rack_unit_id/.test(error.message || '')) {
    ;({ data: shelves, error } = await withTimeout(
      supabase.from('shelves').select('id,location_id').eq('rack_unit_id', rackUnitId),
    ))
  }
  if (error && isMissingRackUnitColumnError(error)) {
    const { data: unit } = await withTimeout(
      supabase.from('rack_units').select('rack_code,name,location_id').eq('id', rackUnitId).maybeSingle(),
    ).catch(() => ({ data: null }))
    const rackCode = extractRackCode(unit?.rack_code) || extractRackCode(unit?.name)
    if (!rackCode || !unit?.location_id) return []
    const matched = await fetchShelvesForRackCode(unit.location_id, rackCode)
    return matched.map((shelf) => ({ id: shelf.id, location_id: shelf.location_id || unit.location_id }))
  }
  if (error) throw error
  return shelves || []
}

export async function updateRack({ rackUnitId, shelfId, itemIds, shelfConfigs }) {
  try {
    const targetRackUnitId = rackUnitId || null
    const targetShelfId = shelfId || null
    if (!targetRackUnitId && !targetShelfId) throw new Error('Rack is required.')

    if (targetRackUnitId) {
      if (Array.isArray(shelfConfigs) && shelfConfigs.length) {
        for (const config of shelfConfigs) {
          if (!config?.shelfId) continue
          if (config.itemIds !== undefined) {
            await setRackItems({ shelfId: config.shelfId, itemIds: config.itemIds })
          }
        }
      } else if (itemIds !== undefined) {
        const shelves = await getShelfIdsForRackUnit(targetRackUnitId)
        for (const shelf of shelves) {
          await setRackItems({ shelfId: shelf.id, itemIds })
        }
      }

      clearStorageRoomsCache()
      return
    }

    if (itemIds !== undefined) {
      await setRackItems({ shelfId: targetShelfId, itemIds })
    }
  } catch (error) {
    throw error
  }
}

export async function deleteRack({ rackUnitId, shelfId }) {
  try {
    const targetRackUnitId = rackUnitId || null
    const targetShelfId = shelfId || null
    if (!targetRackUnitId && !targetShelfId) throw new Error('Rack is required.')

    if (targetRackUnitId) {
      const { data: unit, error: unitFetchError } = await withTimeout(
        supabase.from('rack_units').select('id,location_id').eq('id', targetRackUnitId).maybeSingle(),
      )
      if (unitFetchError && !/rack_units|relation|schema cache/.test(unitFetchError.message || '')) {
        throw unitFetchError
      }

      if (unit?.id) {
        const shelves = await getShelfIdsForRackUnit(targetRackUnitId)

        for (const shelf of shelves) {
          await deactivateShelfRecord(shelf.id, shelf.location_id)
        }

        await withTimeout(
          supabase.from('rack_units').update({ is_active: false }).eq('id', targetRackUnitId),
        )

        if (unit.location_id) {
          void syncLocationLinenTotalsFromBalances(unit.location_id).catch(() => { })
        }
        clearStorageRoomsCache()
        await getActiveShelfIds(true)
        return
      }
    }

    let { data: shelf, error: shelfFetchError } = await withTimeout(
      supabase.from('shelves').select('id,location_id,rack_unit_id').eq('id', targetShelfId).maybeSingle(),
    )
    if (shelfFetchError && /column|rack_unit_id/.test(shelfFetchError.message || '')) {
      ;({ data: shelf, error: shelfFetchError } = await withTimeout(
        supabase.from('shelves').select('id,location_id').eq('id', targetShelfId).maybeSingle(),
      ))
    }
    if (shelfFetchError) throw shelfFetchError
    if (!shelf) throw new Error('Rack not found.')

    await deactivateShelfRecord(shelf.id, shelf.location_id)

    if (shelf.rack_unit_id) {
      await withTimeout(
        supabase.from('rack_units').update({ is_active: false }).eq('id', shelf.rack_unit_id),
      )
    }

    if (shelf.location_id) {
      void syncLocationLinenTotalsFromBalances(shelf.location_id).catch(() => { })
    }
    clearStorageRoomsCache()
    await getActiveShelfIds(true)
  } catch (error) {
    throw error
  }
}

async function deactivateShelfRecord(shelfId, locationId) {
  const { error: balanceDeleteError } = await withTimeout(
    supabase.from('balances').delete().eq('shelf_id', shelfId),
  )
  if (balanceDeleteError) throw balanceDeleteError

  try {
    await withTimeout(
      supabase.from('shelf_items').update({ is_active: false }).eq('shelf_id', shelfId),
    )
  } catch (_shelfItemsError) {
    // shelf_items may not exist on older databases
  }

  const { error: shelfUpdateError } = await withTimeout(
    supabase.from('shelves').update({ is_active: false }).eq('id', shelfId),
  )
  if (shelfUpdateError) throw shelfUpdateError

  if (locationId) {
    void syncLocationLinenTotalsFromBalances(locationId).catch(() => { })
  }
}

const resolveLocationTotalColumn = (itemName, itemLabel) => {
  const value = `${itemName || ''} ${itemLabel || ''}`.toLowerCase()
  if (value.includes('pillow case') || value.includes('pillowcase')) return 'pillow_case'
  if (value.includes('pillow')) return 'pillow_case'
  if (value.includes('hand') || value.includes('face')) return 'face_hand_towel'
  if (value.includes('body') || value.includes('bath')) return 'body_towel'
  if (value.includes('sheet') || value.includes('blanket') || value.includes('linen')) return 'linen'
  return null
}

export async function adjustShelfItemCount({
  shelfId,
  locationId,
  itemId,
  delta,
  staffId,
  staffName,
  itemName,
  itemLabel,
}) {
  try {
    const change = Number(delta || 0)
    if (!change) return { current_balance: null, applied_delta: 0 }

    const { data: currentBalanceRow, error: balanceFetchError } = await withTimeout(
      supabase
        .from('balances')
        .select('id,current_balance')
        .eq('shelf_id', shelfId)
        .eq('item_id', itemId)
        .maybeSingle(),
    )
    if (balanceFetchError) throw balanceFetchError

    const currentBalance = Number(currentBalanceRow?.current_balance || 0)
    const nextBalance = Math.max(0, currentBalance + change)
    const appliedDelta = nextBalance - currentBalance

    if (appliedDelta === 0) {
      return { current_balance: currentBalance, applied_delta: 0 }
    }

    let updatedBalanceRow = null
    if (currentBalanceRow?.id) {
      const { data, error } = await withTimeout(
        supabase
          .from('balances')
          .update({
            current_balance: nextBalance,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentBalanceRow.id)
          .select('id,current_balance,updated_at')
          .single(),
      )
      if (error) throw error
      updatedBalanceRow = data
    } else {
      const now = new Date().toISOString()
      const { data, error } = await withTimeout(
        supabase
          .from('balances')
          .insert({
            shelf_id: shelfId,
            location_id: locationId,
            item_id: itemId,
            current_balance: nextBalance,
            updated_at: now,
          })
          .select('id,current_balance,updated_at')
          .single(),
      )
      if (error) throw error
      updatedBalanceRow = data
    }

    const actionType = appliedDelta > 0 ? 'restock' : 'pull'
    void withTimeout(
      supabase.from('log_entries').insert({
        location_id: locationId,
        shelf_id: shelfId,
        item_id: itemId,
        action_type: actionType,
        quantity: Math.abs(appliedDelta),
        staff_id: staffId || null,
        staff_name: staffName || null,
        notes: 'rack_count_adjustment',
      }),
    ).catch(() => { })

    const totalColumn = resolveLocationTotalColumn(itemName, itemLabel)
    if (totalColumn && locationId) {
      void withTimeout(
        supabase
          .from('location_linen_totals')
          .select('id,linen,face_hand_towel,body_towel,pillow_case')
          .eq('location_id', locationId)
          .maybeSingle(),
      )
        .then(async ({ data: totalRow, error: totalsFetchError }) => {
          if (totalsFetchError) return
          if (totalRow?.id) {
            const updatedTotal = Math.max(0, Number(totalRow[totalColumn] || 0) + appliedDelta)
            await withTimeout(
              supabase
                .from('location_linen_totals')
                .update({ [totalColumn]: updatedTotal, updated_at: new Date().toISOString() })
                .eq('id', totalRow.id),
            )
            return
          }
          const baseTotals = {
            location_id: locationId,
            linen: 0,
            face_hand_towel: 0,
            body_towel: 0,
            pillow_case: 0,
          }
          baseTotals[totalColumn] = Math.max(0, appliedDelta)
          await withTimeout(supabase.from('location_linen_totals').insert(baseTotals))
        })
        .catch(() => { })
    }

    clearStorageRoomsCache()

    return {
      current_balance: Number(updatedBalanceRow?.current_balance || nextBalance),
      applied_delta: appliedDelta,
      updated_at: updatedBalanceRow?.updated_at || new Date().toISOString(),
    }
  } catch (error) {
    throw error
  }
}

export async function transferShelfItemCount({
  fromShelfId,
  fromLocationId,
  toShelfId,
  toLocationId,
  itemId,
  quantity,
  staffId,
  staffName,
  itemName,
  itemLabel,
}) {
  const amount = Number(quantity || 0)
  if (!amount || amount <= 0) {
    throw new Error('Transfer amount must be greater than zero.')
  }
  if (fromShelfId === toShelfId) {
    throw new Error('Source and destination racks must be different.')
  }

  const pullResult = await adjustShelfItemCount({
    shelfId: fromShelfId,
    locationId: fromLocationId,
    itemId,
    delta: -amount,
    staffId,
    staffName,
    itemName,
    itemLabel,
  })

  if (!pullResult.applied_delta) {
    throw new Error('Not enough stock on the source rack.')
  }

  const transferred = Math.abs(pullResult.applied_delta)

  await adjustShelfItemCount({
    shelfId: toShelfId,
    locationId: toLocationId,
    itemId,
    delta: transferred,
    staffId,
    staffName,
    itemName,
    itemLabel,
  })

  await withTimeout(
    supabase.from('log_entries').insert({
      location_id: fromLocationId,
      shelf_id: fromShelfId,
      item_id: itemId,
      action_type: 'transfer',
      quantity: transferred,
      staff_id: staffId || null,
      staff_name: staffName || null,
      notes: `transfer_to:${toLocationId}:${toShelfId}`,
    }),
  )

  return { transferred }
}

export async function getTasksForToday() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('tasks')
        .select('id,title,details,subtasks,assigned_date,status,priority,is_priority,created_by,creator_name,created_at')
        .eq('assigned_date', todayIso())
        .order('is_priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(100),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function getAllTasksForToday() {
  try {
    const today = todayIso()
    const { data, error } = await withTimeout(
      supabase
        .from('tasks')
        .select('id,title,details,subtasks,assigned_date,status,priority,is_priority,creator_name,created_at')
        .eq('assigned_date', today)
        .order('is_priority', { ascending: false })
        .order('created_at', { ascending: true }),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function insertTask(task) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('tasks')
        .insert(task)
        .select('id,title,details,subtasks,assigned_date,status,priority,is_priority,created_by,creator_name,created_at')
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function updateTaskStatus(id, status) {
  try {
    const { data, error } = await withTimeout(
      supabase.from('tasks').update({ status }).eq('id', id).select().single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function deleteTask(id) {
  try {
    const { error } = await withTimeout(supabase.from('tasks').delete().eq('id', id))
    if (error) throw error
  } catch (error) {
    throw error
  }
}

export async function updateTask(id, updates) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select('id,title,details,subtasks,assigned_date,status,priority,is_priority,created_by,creator_name,created_at')
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function getLaundryBatches() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('laundry_batches')
        .select(
          'id,name,origin_location_id,destination_location_id,status,created_by,creator_name,stage_updated_at,created_at,laundry_batch_items(id,quantity,item_id,items(id,name,label))',
        )
        .neq('status', 'returned')
        .order('created_at', { ascending: false })
        .limit(50),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function getActiveLaundryLoads() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('laundry_loads')
        .select(
          'id,machine_number,storage_room,status,started_at,estimated_finish_at,cycle_minutes,completed_at,creator_name,notes',
        )
        .neq('status', 'complete')
        .order('started_at', { ascending: true })
        .limit(50),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function createLaundryLoad(
  machineNumber,
  storageRoom,
  creatorName,
  userId,
  notes,
  cycleMinutes,
) {
  try {
    const durationMinutes = Number(cycleMinutes) || SETTINGS.laundry.totalCycleMinutes
    const now = new Date()
    const estimatedFinish = new Date(now.getTime() + durationMinutes * 60 * 1000)
    let creatorId = userId || null

    // Avoid foreign-key failures when a profile row has not been created yet.
    if (creatorId) {
      const { data: profileRow } = await withTimeout(
        supabase.from('profiles').select('id').eq('id', creatorId).maybeSingle(),
      )
      if (!profileRow?.id) {
        creatorId = null
      }
    }

    const { data, error } = await withTimeout(
      supabase
        .from('laundry_loads')
        .insert({
          machine_number: machineNumber,
          storage_room: storageRoom,
          status: 'washing',
          started_at: now.toISOString(),
          estimated_finish_at: estimatedFinish.toISOString(),
          cycle_minutes: durationMinutes,
          created_by: creatorId,
          creator_name: creatorName,
          notes: notes || null,
        })
        .select(
          'id,machine_number,storage_room,status,started_at,estimated_finish_at,cycle_minutes,completed_at,creator_name,notes',
        )
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function updateLaundryLoadStatus(id, status) {
  try {
    const updates = { status }
    if (status === 'complete') {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await withTimeout(
      supabase
        .from('laundry_loads')
        .update(updates)
        .eq('id', id)
        .select(
          'id,machine_number,storage_room,status,started_at,estimated_finish_at,cycle_minutes,completed_at,creator_name,notes',
        )
        .single(),
    )
    if (error) throw error

    if (status === 'complete' && data) {
      const weekStartIso = format(new Date(), 'yyyy-MM-dd')

      // Store completed cycles for weekly reporting.
      await withTimeout(
        supabase.from('laundry_cycle_reports').insert({
          load_id: data.id,
          machine_number: data.machine_number,
          storage_room: data.storage_room,
          cycle_minutes: data.cycle_minutes || SETTINGS.laundry.totalCycleMinutes,
          started_at: data.started_at,
          completed_at: data.completed_at || new Date().toISOString(),
          week_start: weekStartIso,
        }),
      )

      // Keep report table lightweight by deleting rows older than last week.
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 14)
      await withTimeout(
        supabase.from('laundry_cycle_reports').delete().lt('completed_at', cutoff.toISOString()),
      )
    }

    return data
  } catch (error) {
    throw error
  }
}

export async function getNextPickupEvents() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_schedule')
        .select('id,pickup_date,notes,created_at')
        .order('pickup_date', { ascending: true })
        .limit(200),
    )
    if (error) throw error
    if (!data?.length) return { date: null, events: [] }

    const today = todayIso()
    const upcoming = (data || [])
      .filter((entry) => getEventDateRange(entry).endDate >= today)
      .sort((a, b) => {
        const aRange = getEventDateRange(a)
        const bRange = getEventDateRange(b)
        if (aRange.startDate !== bRange.startDate) {
          return aRange.startDate.localeCompare(bRange.startDate)
        }
        return String(a.created_at || '').localeCompare(String(b.created_at || ''))
      })

    if (!upcoming.length) return { date: null, events: [] }

    const displayDate = upcoming.reduce((best, entry) => {
      const { startDate } = getEventDateRange(entry)
      const candidate = startDate >= today ? startDate : today
      if (!best || candidate < best) return candidate
      return best
    }, null)

    const events = upcoming.filter((entry) => eventIsActiveOnDate(entry, displayDate))

    return { date: displayDate, events }
  } catch (error) {
    throw error
  }
}

/** @deprecated Use getNextPickupEvents */
export async function getNextPickupDate() {
  const { date, events } = await getNextPickupEvents()
  return events[0] ? { ...events[0], pickup_date: date } : null
}

export async function getPickupDates() {
  try {
    const { data, error } = await withTimeout(
      supabase.from('pickup_schedule').select('id,pickup_date,notes').order('pickup_date', { ascending: true }),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function addPickupDate(pickupDate, userId, notes = null) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_schedule')
        .insert({ pickup_date: pickupDate, created_by: userId || null, notes: notes || null })
        .select()
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function removePickupDate(id) {
  try {
    const { error } = await withTimeout(supabase.from('pickup_schedule').delete().eq('id', id))
    if (error) throw error
  } catch (error) {
    throw error
  }
}

export async function getActiveShiftNote() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('shift_notes')
        .select('id,body,created_by,creator_name,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function getRecentLogEntries(staffId, limit = 8) {
  try {
    const cappedLimit = Math.min(limit, 50)
    const { data, error } = await withTimeout(
      supabase
        .from('log_entries')
        .select('id,location_id,item_id,action_type,quantity,staff_id,staff_name,created_at,locations(name),items(name,label)')
        .eq('staff_id', staffId)
        .order('created_at', { ascending: false })
        .limit(cappedLimit),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

export async function getStaffActivityToday() {
  try {
    const [staffResult, entriesResult] = await Promise.all([
      withTimeout(
        supabase
          .from('profiles')
          .select('id,full_name,is_active')
          .eq('is_active', true)
          .order('full_name')
          .limit(100),
      ),
      withTimeout(
        supabase
          .from('log_entries')
          .select('staff_id,created_at')
          .gte('created_at', startOfTodayIso())
          .lte('created_at', endOfTodayIso())
          .order('created_at', { ascending: false })
          .limit(100),
      ),
    ])

    const { data: staff, error: staffError } = staffResult
    if (staffError) throw staffError

    const { data: entries, error: entriesError } = entriesResult
    if (entriesError) throw entriesError

    const activityByStaff = (entries || []).reduce((acc, entry) => {
      if (!entry.staff_id) return acc
      if (!acc[entry.staff_id]) acc[entry.staff_id] = { count: 0, last_active: entry.created_at }
      acc[entry.staff_id].count += 1
      return acc
    }, {})

    return (staff || []).map((member) => ({
      ...member,
      entry_count: activityByStaff[member.id]?.count || 0,
      last_active: activityByStaff[member.id]?.last_active || null,
    }))
  } catch (error) {
    throw error
  }
}

export async function getUncountedShelves() {
  try {
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [{ data: shelves, error: shelvesError }, { data: recentLogs, error: logsError }] =
      await Promise.all([
        withTimeout(
          supabase
            .from('shelves')
            .select('id,name,location_id,locations(name)')
            .eq('is_active', true)
            .order('name')
            .limit(100),
        ),
        withTimeout(
          supabase
            .from('log_entries')
            .select('shelf_id,created_at')
            .gte('created_at', dayAgoIso)
            .not('shelf_id', 'is', null)
            .limit(500),
        ),
      ])
    if (shelvesError) throw shelvesError
    if (logsError) throw logsError

    const countedShelfIds = new Set((recentLogs || []).map((entry) => entry.shelf_id))

    return (shelves || [])
      .filter((shelf) => !countedShelfIds.has(shelf.id))
      .map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        location_id: shelf.location_id,
        locations: shelf.locations,
        last_count_time: null,
      }))
  } catch (error) {
    if (/is_active|column/.test(error.message || '')) {
      const { data: shelves, error: shelvesError } = await withTimeout(
        supabase.from('shelves').select('id,name,location_id,locations(name)').order('name').limit(100),
      )
      if (shelvesError) throw shelvesError
      return shelves || []
    }
    throw error
  }
}

export async function getLinenCountByRoom() {
  try {
    const { data, error } = await withTimeout(supabase.rpc('get_linen_counts_by_room'))
    if (!error && Array.isArray(data)) return data
    if (error && !isRpcMissingError(error)) throw error
  } catch (error) {
    if (error.message === 'Request timed out') throw error
  }

  return getActiveShelfBalances(
    'current_balance,updated_at,location_id,shelf_id,locations(id,name),items(id,label)',
  )
}

export async function getActivePickupMission() {
  try {
    const { data: mission, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .select('id,status,created_at,completed_at,created_by,completed_by')
        .eq('status', 'active')
        .maybeSingle(),
    )
    if (error) throw error
    if (!mission) return null

    const { data: groups, error: groupsError } = await withTimeout(
      supabase
        .from('pickup_mission_groups')
        .select('id,mission_id,name,face_towels,body_towels,top_sheets,pillow_cases,created_at,updated_at')
        .eq('mission_id', mission.id)
        .order('created_at', { ascending: true }),
    )
    if (groupsError) throw groupsError

    return { ...mission, groups: groups || [] }
  } catch (error) {
    throw error
  }
}

export async function startPickupMission(userId) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .insert({ status: 'active', created_by: userId || null })
        .select('id,status,created_at,completed_at,created_by,completed_by')
        .single(),
    )
    if (error) throw error
    return { ...data, groups: [] }
  } catch (error) {
    throw error
  }
}

export async function savePickupMissionGroup({
  missionId,
  groupId,
  name,
  faceTowels,
  bodyTowels,
  topSheets,
  pillowCases,
  userId,
}) {
  try {
    const payload = {
      mission_id: missionId,
      name: String(name || '').trim(),
      face_towels: Math.max(0, Number(faceTowels) || 0),
      body_towels: Math.max(0, Number(bodyTowels) || 0),
      top_sheets: Math.max(0, Number(topSheets) || 0),
      pillow_cases: Math.max(0, Number(pillowCases) || 0),
      updated_at: new Date().toISOString(),
    }

    if (groupId) {
      const { data, error } = await withTimeout(
        supabase
          .from('pickup_mission_groups')
          .update(payload)
          .eq('id', groupId)
          .select('id,mission_id,name,face_towels,body_towels,top_sheets,pillow_cases,created_at,updated_at')
          .single(),
      )
      if (error) throw error
      return data
    }

    const { data, error } = await withTimeout(
      supabase
        .from('pickup_mission_groups')
        .insert({ ...payload, created_by: userId || null })
        .select('id,mission_id,name,face_towels,body_towels,top_sheets,pillow_cases,created_at,updated_at')
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function deletePickupMissionGroup(groupId) {
  try {
    const { error } = await withTimeout(supabase.from('pickup_mission_groups').delete().eq('id', groupId))
    if (error) throw error
  } catch (error) {
    throw error
  }
}

export async function completePickupMission(missionId, userId) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .update({
          status: 'completed',
          completed_by: userId || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', missionId)
        .eq('status', 'active')
        .select('id,status,created_at,completed_at,created_by,completed_by')
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function getPickupMissionHistory(limit = 30) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .select(
          'id,status,created_at,completed_at,created_by,completed_by,pickup_mission_groups(id,name,face_towels,body_towels,top_sheets,pillow_cases,created_at)',
        )
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(limit),
    )
    if (error) throw error
    return (data || []).map((mission) => ({
      ...mission,
      groups: mission.pickup_mission_groups || [],
    }))
  } catch (error) {
    throw error
  }
}

export async function getPickupMissionGroup(groupId) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_mission_groups')
        .select('id,mission_id,name,face_towels,body_towels,top_sheets,pillow_cases,created_at,updated_at')
        .eq('id', groupId)
        .maybeSingle(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function getCompletedPickupMission(missionId) {
  try {
    const { data: mission, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .select('id,status,created_at,completed_at,created_by,completed_by')
        .eq('id', missionId)
        .eq('status', 'completed')
        .maybeSingle(),
    )
    if (error) throw error
    if (!mission) return null

    const { data: groups, error: groupsError } = await withTimeout(
      supabase
        .from('pickup_mission_groups')
        .select('id,mission_id,name,face_towels,body_towels,top_sheets,pillow_cases,created_at,updated_at')
        .eq('mission_id', mission.id)
        .order('created_at', { ascending: true }),
    )
    if (groupsError) throw groupsError

    return { ...mission, groups: groups || [] }
  } catch (error) {
    throw error
  }
}

export async function updatePickupMissionCompletedDate(missionId, completedDate) {
  try {
    const dateValue = String(completedDate || '').trim()
    if (!dateValue) throw new Error('Completed date is required')

    const completedAt = new Date(`${dateValue}T12:00:00`).toISOString()

    const { data, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .update({ completed_at: completedAt })
        .eq('id', missionId)
        .eq('status', 'completed')
        .select('id,status,created_at,completed_at,created_by,completed_by')
        .single(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
}

export async function deletePickupMission(missionId) {
  try {
    const { error } = await withTimeout(
      supabase.from('pickup_missions').delete().eq('id', missionId).eq('status', 'completed'),
    )
    if (error) throw error
  } catch (error) {
    throw error
  }
}

export async function createHistoricalPickupMission({ completedDate, groups, userId }) {
  try {
    const dateValue = String(completedDate || '').trim()
    if (!dateValue) throw new Error('Completed date is required')

    const normalizedGroups = (groups || [])
      .map((group) => ({
        name: String(group.name || '').trim(),
        face_towels: Math.max(0, Number(group.face_towels) || 0),
        body_towels: Math.max(0, Number(group.body_towels) || 0),
        top_sheets: Math.max(0, Number(group.top_sheets) || 0),
        pillow_cases: Math.max(0, Number(group.pillow_cases) || 0),
      }))
      .filter((group) => group.name)

    if (!normalizedGroups.length) {
      throw new Error('Add at least one group with a name')
    }

    const completedAt = new Date(`${dateValue}T12:00:00`).toISOString()

    const { data: mission, error } = await withTimeout(
      supabase
        .from('pickup_missions')
        .insert({
          status: 'completed',
          created_by: userId || null,
          completed_by: userId || null,
          created_at: completedAt,
          completed_at: completedAt,
        })
        .select('id,status,created_at,completed_at,created_by,completed_by')
        .single(),
    )
    if (error) throw error

    const groupRows = normalizedGroups.map((group) => ({
      mission_id: mission.id,
      name: group.name,
      face_towels: group.face_towels,
      body_towels: group.body_towels,
      top_sheets: group.top_sheets,
      pillow_cases: group.pillow_cases,
      created_by: userId || null,
      created_at: completedAt,
      updated_at: completedAt,
    }))

    const { error: groupsError } = await withTimeout(
      supabase.from('pickup_mission_groups').insert(groupRows),
    )
    if (groupsError) throw groupsError

    return { ...mission, groups: groupRows }
  } catch (error) {
    throw error
  }
}
