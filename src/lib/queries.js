import { format } from 'date-fns'
import { supabase } from '../supabase'
import { SETTINGS } from '../config/settings'

const todayIso = () => format(new Date(), 'yyyy-MM-dd')
const startOfTodayIso = () => `${todayIso()}T00:00:00`
const endOfTodayIso = () => `${todayIso()}T23:59:59`

let cachedLocations = null
let cachedItems = null

export async function withTimeout(promise, ms = 8000) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timed out')), ms)
  })
  return Promise.race([promise, timeout])
}

export async function getProfile(userId) {
  let roleData = null
  let profileData = null

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('user_access_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle(),
    )
    if (!error) roleData = data
  } catch (_error) {
    // Ignore role-table fetch errors; profile table may still resolve.
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id,full_name,role,location_access,is_active,created_at')
        .eq('id', userId)
        .maybeSingle(),
    )
    if (!error) profileData = data
  } catch (_error) {
    // Ignore profile fetch errors; role-table can still drive admin/staff view.
  }

  const effectiveRole = roleData?.role || profileData?.role || 'staff'
  if (profileData) return { ...profileData, role: effectiveRole }

  return {
    id: userId,
    full_name: 'Staff User',
    role: effectiveRole,
    location_access: null,
    is_active: true,
    created_at: null,
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

export async function adminCreateUserAccount({ email, fullName, temporaryPassword, role }) {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_create_user_account', {
        p_email: email,
        p_full_name: fullName,
        p_temporary_password: temporaryPassword,
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

export async function getLocations() {
  try {
    if (cachedLocations) return cachedLocations
    const { data, error } = await withTimeout(
      supabase
        .from('locations')
        .select('id,name,mode,building,low_threshold,critical_threshold,is_active,created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(100),
    )
    if (error) throw error
    cachedLocations = data || []
    return cachedLocations
  } catch (error) {
    throw error
  }
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

export async function getStorageRooms() {
  try {
    const { data: locations, error: locationsError } = await withTimeout(
      supabase
        .from('locations')
        .select(
          'id,name,building,low_threshold,critical_threshold,location_linen_totals(linen,face_hand_towel,body_towel,pillow_case,updated_at),log_entries(created_at,staff_name)',
        )
        .eq('is_active', true)
        .eq('mode', 'full')
        .order('created_at', { ascending: true })
        .order('created_at', { ascending: false, referencedTable: 'log_entries' })
        .limit(1, { referencedTable: 'log_entries' })
        .limit(100),
    )
    if (locationsError) throw locationsError

    return (locations || []).map((location) => {
      const roomTotal = Array.isArray(location.location_linen_totals)
        ? location.location_linen_totals[0]
        : location.location_linen_totals
      const latest = Array.isArray(location.log_entries) ? location.log_entries[0] : null
      const itemBreakdown = [
        { label: 'Linen', quantity: Number(roomTotal?.linen || 0) },
        { label: 'Face/Hand Towel', quantity: Number(roomTotal?.face_hand_towel || 0) },
        { label: 'Body Towel', quantity: Number(roomTotal?.body_towel || 0) },
        { label: 'Pillow Case', quantity: Number(roomTotal?.pillow_case || 0) },
      ].filter((item) => item.quantity > 0)
      const totalBundles =
        Number(roomTotal?.linen || 0) +
        Number(roomTotal?.face_hand_towel || 0) +
        Number(roomTotal?.body_towel || 0) +
        Number(roomTotal?.pillow_case || 0)

      return {
        id: location.id,
        name: location.name,
        building: location.building,
        low_threshold: location.low_threshold,
        critical_threshold: location.critical_threshold,
        total_bundles: totalBundles,
        last_count_time: latest?.created_at || roomTotal?.updated_at || null,
        last_count_staff: latest?.staff_name || null,
        item_breakdown: itemBreakdown,
      }
    })
  } catch (error) {
    throw error
  }
}

export async function getShelvesByRoom(locationId) {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('shelves')
        .select('id,name,balances(id,current_balance,item_id,items(id,name,label))')
        .eq('location_id', locationId)
        .order('name', { ascending: true })
        .limit(100),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}

const resolveLocationTotalColumn = (itemName, itemLabel) => {
  const value = `${itemName || ''} ${itemLabel || ''}`.toLowerCase()
  if (value.includes('pillow')) return 'pillow_case'
  if (value.includes('hand') || value.includes('face')) return 'face_hand_towel'
  if (value.includes('body') || value.includes('bath')) return 'body_towel'
  if (value.includes('sheet') || value.includes('linen')) return 'linen'
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
          .select('id,current_balance')
          .single(),
      )
      if (error) throw error
      updatedBalanceRow = data
    } else {
      const { data, error } = await withTimeout(
        supabase
          .from('balances')
          .insert({
            shelf_id: shelfId,
            location_id: locationId,
            item_id: itemId,
            current_balance: nextBalance,
          })
          .select('id,current_balance')
          .single(),
      )
      if (error) throw error
      updatedBalanceRow = data
    }

    const actionType = appliedDelta > 0 ? 'restock' : 'pull'
    await withTimeout(
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
    )

    const totalColumn = resolveLocationTotalColumn(itemName, itemLabel)
    if (totalColumn && locationId) {
      const { data: totalRow, error: totalsFetchError } = await withTimeout(
        supabase
          .from('location_linen_totals')
          .select('id,linen,face_hand_towel,body_towel,pillow_case')
          .eq('location_id', locationId)
          .maybeSingle(),
      )
      if (totalsFetchError) throw totalsFetchError

      if (totalRow?.id) {
        const updatedTotal = Math.max(0, Number(totalRow[totalColumn] || 0) + appliedDelta)
        const { error: totalsUpdateError } = await withTimeout(
          supabase
            .from('location_linen_totals')
            .update({ [totalColumn]: updatedTotal, updated_at: new Date().toISOString() })
            .eq('id', totalRow.id),
        )
        if (totalsUpdateError) throw totalsUpdateError
      } else {
        const baseTotals = {
          location_id: locationId,
          linen: 0,
          face_hand_towel: 0,
          body_towel: 0,
          pillow_case: 0,
        }
        baseTotals[totalColumn] = Math.max(0, appliedDelta)
        const { error: totalsInsertError } = await withTimeout(
          supabase.from('location_linen_totals').insert(baseTotals),
        )
        if (totalsInsertError) throw totalsInsertError
      }
    }

    return { current_balance: Number(updatedBalanceRow?.current_balance || nextBalance), applied_delta: appliedDelta }
  } catch (error) {
    throw error
  }
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
        .select('id,title,details,subtasks,status,priority,is_priority,creator_name,created_at')
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

export async function getNextPickupDate() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pickup_schedule')
        .select('id,pickup_date,notes,created_at')
        .gte('pickup_date', todayIso())
        .order('pickup_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
    )
    if (error) throw error
    return data
  } catch (error) {
    throw error
  }
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

    return (staff || []).map((member) => {
      const memberEntries = (entries || []).filter((entry) => entry.staff_id === member.id)
      return {
        ...member,
        entry_count: memberEntries.length,
        last_active: memberEntries[0]?.created_at || null,
      }
    })
  } catch (error) {
    throw error
  }
}

export async function getUncountedShelves() {
  try {
    const { data: shelves, error: shelvesError } = await withTimeout(
      supabase
        .from('shelves')
        .select('id,name,location_id,locations(name),log_entries(created_at)')
        .order('name')
        .order('created_at', { ascending: false, referencedTable: 'log_entries' })
        .limit(100),
    )
    if (shelvesError) throw shelvesError

    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    return (shelves || [])
      .filter(
        (shelf) =>
          !(shelf.log_entries || []).some((entry) => entry.created_at && entry.created_at >= dayAgoIso),
      )
      .map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        location_id: shelf.location_id,
        locations: shelf.locations,
        last_count_time: shelf.log_entries?.[0]?.created_at || null,
      }))
  } catch (error) {
    throw error
  }
}

export async function getLinenCountByRoom() {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('balances')
        .select('current_balance,updated_at,locations(id,name),items(id,label)')
        .limit(1000),
    )
    if (error) throw error
    return data || []
  } catch (error) {
    throw error
  }
}
