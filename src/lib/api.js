import { supabase } from './supabase'

const syncFunction = import.meta.env.VITE_SYNC_FUNCTION || 'sync-google-sheets'
const unwrap = ({ data, error }) => { if (error) throw error; return data }

export async function ensureProfile() {
  const profile = unwrap(await supabase.rpc('ops_ensure_profile'))
  if (!profile?.active) {
    if (typeof window !== 'undefined') {
      window.alert('Your SwiftSupply Ops access request is pending. The Owner must approve your staff account before you can access anything.')
    }
    await supabase.auth.signOut()
    const error = new Error('Staff approval required')
    error.code = 'STAFF_APPROVAL_REQUIRED'
    throw error
  }
  return profile
}

export async function loadAll() {
  const queries = await Promise.all([
    supabase.from('ops_profiles').select('*').order('full_name'),
    supabase.from('ops_customers').select('*').order('name'),
    supabase.from('ops_jobs').select('*').order('created_at', { ascending: false }).limit(250),
    supabase.from('ops_job_assignments').select('*'),
    supabase.from('ops_subscriptions').select('*').order('created_at', { ascending: false }),
    supabase.from('ops_vending_locations').select('*').order('name'),
    supabase.from('ops_vending_machines').select('*').order('label'),
    supabase.from('ops_vending_visits').select('*').order('created_at', { ascending: false }).limit(250),
    supabase.from('ops_vending_restock_items').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('ops_products').select('*').order('business_unit').order('name'),
    supabase.from('ops_psss_sales').select('*').order('sold_at', { ascending: false }).limit(250),
    supabase.from('ops_psss_sale_items').select('*').limit(1000),
    supabase.from('ops_transactions').select('*').order('occurred_at', { ascending: false }).limit(500),
    supabase.from('ops_maintenance').select('*').order('reported_at', { ascending: false }).limit(250),
    supabase.from('ops_calendar_events').select('*').order('starts_at', { ascending: true }).limit(500),
    supabase.from('ops_inventory_movements').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('ops_audit_log').select('*').order('created_at', { ascending: false }).limit(150),
    supabase.from('ops_sync_queue').select('id,status,last_error,created_at').order('created_at', { ascending: false }).limit(100)
  ])
  const names = [
    'profiles','customers','jobs','assignments','subscriptions','locations','machines','visits',
    'restockItems','products','sales','saleItems','transactions','maintenance','calendarEvents',
    'inventoryMovements','auditLog','syncQueue'
  ]
  const out = {}
  queries.forEach((q, i) => {
    if (q.error && q.error.code !== '42501') throw q.error
    out[names[i]] = q.data || []
  })
  return out
}

async function userId() { return (await supabase.auth.getUser()).data.user?.id }
export async function triggerSync() { try { return await supabase.functions.invoke(syncFunction, { body: { drain: true } }) } catch { return null } }
const syncAfter = async result => { const data = unwrap(result); triggerSync(); return data }

export async function createCustomer(values) {
  return syncAfter(await supabase.from('ops_customers').insert({ ...values, created_by: await userId() }).select().single())
}
export async function createJob(values) {
  const { employee_id, ...jobValues } = values
  return syncAfter(await supabase.from('ops_jobs').insert({ ...jobValues, created_by: await userId() }).select().single())
}
export async function assignJob(jobId, employeeId) {
  return unwrap(await supabase.from('ops_job_assignments').upsert({ job_id: jobId, employee_id: employeeId }))
}
export async function updateJob(id, values) { return syncAfter(await supabase.from('ops_jobs').update(values).eq('id', id).select().single()) }
export async function completeJob(id, values) {
  return syncAfter(await supabase.rpc('ops_complete_job', {
    p_job_id: id,
    p_actual_revenue: Number(values.actual_revenue || 0),
    p_direct_cost: Number(values.direct_cost || 0),
    p_payment_method: values.payment_method || 'Cash',
    p_payment_status: values.payment_status || 'paid',
    p_account: values.account || 'SS Cash',
    p_notes: values.notes || null
  }))
}
export async function createSubscription(values) { return syncAfter(await supabase.from('ops_subscriptions').insert(values).select().single()) }
export async function createLocation(values) { return syncAfter(await supabase.from('ops_vending_locations').insert(values).select().single()) }
export async function createMachine(values) { return syncAfter(await supabase.from('ops_vending_machines').insert(values).select().single()) }
export async function createVisit(values) { return syncAfter(await supabase.from('ops_vending_visits').insert({ ...values, created_by: await userId() }).select().single()) }
export async function updateVisit(id, values) { return syncAfter(await supabase.from('ops_vending_visits').update(values).eq('id', id).select().single()) }
export async function completeVisit(id, values) {
  return syncAfter(await supabase.rpc('ops_complete_vending_visit', {
    p_visit_id: id,
    p_cash_collected: Number(values.cash_collected || 0),
    p_card_sales: Number(values.card_sales || 0),
    p_restock_cost: Number(values.restock_cost || 0),
    p_location_fee: Number(values.location_fee || 0),
    p_card_fees: Number(values.card_fees || 0),
    p_other_cost: Number(values.other_cost || 0),
    p_cash_account: values.cash_account || 'SS Cash',
    p_card_account: values.card_account || 'SS Bank',
    p_notes: values.notes || null
  }))
}
export async function addRestockItem(values) { return syncAfter(await supabase.rpc('ops_add_restock_item', values)) }
export async function createProduct(values) { return syncAfter(await supabase.from('ops_products').insert(values).select().single()) }
export async function adjustInventory(productId, quantityDelta, movementType='adjustment', notes=null) {
  return unwrap(await supabase.rpc('ops_adjust_inventory', {
    p_product_id: productId,
    p_quantity_delta: Number(quantityDelta),
    p_movement_type: movementType,
    p_notes: notes || null
  }))
}
export async function recordPsssSale(values) {
  return syncAfter(await supabase.rpc('ops_record_psss_sale', {
    p_items: values.items,
    p_total: Number(values.total || 0),
    p_collected: Number(values.collected || 0),
    p_payment_method: values.payment_method || 'Cash',
    p_payment_status: values.payment_status || 'paid',
    p_account: values.account || 'SS Cash',
    p_buyer_place: values.buyer_place || null,
    p_notes: values.notes || null,
    p_request_id: values.request_id
  }))
}
export async function createMaintenance(values) { return syncAfter(await supabase.from('ops_maintenance').insert({ ...values, reported_by: await userId() }).select().single()) }

export async function createCalendarEvent(values) {
  return unwrap(await supabase.from('ops_calendar_events').insert({ ...values, created_by: await userId() }).select().single())
}
export async function updateCalendarEvent(id, values) {
  return unwrap(await supabase.from('ops_calendar_events').update(values).eq('id', id).select().single())
}
export async function deleteCalendarEvent(id) {
  return unwrap(await supabase.from('ops_calendar_events').delete().eq('id', id).select().single())
}

export async function createTransaction(values) {
  const payload = {
    ...values,
    amount: Number(values.amount || 0),
    recorded_by: await userId(),
    source_type: values.source_type || 'manual'
  }
  return syncAfter(await supabase.from('ops_transactions').insert(payload).select().single())
}

export async function setRole(id, role) { return unwrap(await supabase.rpc('ops_set_profile_role', { p_user_id: id, p_role: role })) }
export async function updateStaffProfile(id, values) {
  return unwrap(await supabase.from('ops_profiles').update(values).eq('id', id).select().single())
}
export async function deactivateStaff(id) { return unwrap(await supabase.rpc('ops_deactivate_staff', { p_user_id: id })) }

export async function requestPasswordReset(email) {
  if (!email) throw new Error('Enter your email first.')
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  if (error) throw error
  return true
}
export async function updatePassword(password) {
  if (!password || password.length < 8) throw new Error('Use a password with at least 8 characters.')
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  return data
}
export async function signOut() { return supabase.auth.signOut() }
