import { format } from 'date-fns'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'
import { eventIsActiveOnDate, getEventDateRange } from './eventNotes'

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

export async function getItems() {
  try {
    if (cachedItems) return cachedItems
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

export async function getRackItems() {
  const allItems = await getItems()
  const byName = Object.fromEntries(allItems.map((item) => [item.name, item]))
  return SETTINGS.rackItems.map((config) => byName[config.key]).filter(Boolean)
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
  const normalized = String(code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  if (!normalized) return null

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('shelves')
        .select('id,name,qr_slug,location_id')
        .eq('qr_slug', normalized)
        .maybeSingle(),
    )
    if (error) throw error
    if (!data?.id || !data.location_id) return null

    return {
      shelfId: data.id,
      roomId: data.location_id,
      name: data.name,
      qrSlug: data.qr_slug,
    }
  } catch (error) {
    throw error
  }
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
  const baseQuery = () =>
    supabase
      .from('shelves')
      .select(
        'id,name,qr_slug,created_at,shelf_items(sort_order,is_active,item_id,items(id,name,label)),balances(current_balance,item_id)',
      )
      .eq('location_id', locationId)
      .order('name', { ascending: true })
      .limit(100)

  try {
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
    return data || []
  } catch (error) {
    throw error
  }
}

export async function createRack({ locationId, locationName, name, itemIds = [] }) {
  try {
    const trimmedName = String(name || '').trim()
    if (!locationId || !trimmedName) {
      throw new Error('Room and rack name are required.')
    }

    let qrSlug = buildQrSlug(locationName, trimmedName)
    const { data: shelf, error: shelfError } = await withTimeout(
      supabase
        .from('shelves')
        .insert({
          location_id: locationId,
          name: trimmedName,
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
              name: trimmedName,
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

export async function updateRack({ shelfId, name, itemIds }) {
  try {
    if (!shelfId) throw new Error('Rack is required.')

    const trimmedName = String(name || '').trim()
    if (trimmedName) {
      const { error } = await withTimeout(
        supabase.from('shelves').update({ name: trimmedName }).eq('id', shelfId),
      )
      if (error) throw error
    }

    if (itemIds !== undefined) {
      await setRackItems({ shelfId, itemIds })
    }
  } catch (error) {
    throw error
  }
}

export async function deleteRack({ shelfId }) {
  try {
    if (!shelfId) throw new Error('Rack is required.')

    const { data: shelf, error: shelfFetchError } = await withTimeout(
      supabase.from('shelves').select('id,location_id').eq('id', shelfId).maybeSingle(),
    )
    if (shelfFetchError) throw shelfFetchError
    if (!shelf) throw new Error('Rack not found.')

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

    if (shelf.location_id) {
      void syncLocationLinenTotalsFromBalances(shelf.location_id).catch(() => { })
    }
    clearStorageRoomsCache()
    await getActiveShelfIds(true)
  } catch (error) {
    throw error
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
