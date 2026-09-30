import React, { useEffect, useMemo, useState } from 'react'
import { Ticket, RefreshCw, X, Plus, CheckCircle2, Pause, Play, Ban, RotateCcw } from 'lucide-react'
import { supabase } from './lib/supabase'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))
const dateLabel = v => v ? new Date(`${v}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>
const methodAccount = method => method === 'Apple Cash' ? 'Apple Cash' : ['Card', 'Zelle'].includes(method) ? 'SS Bank' : method === 'Other' ? 'Other' : 'SS Cash'
const plans = {
  weekly: { name: 'Weekly Pass', price: 12, credits: 4, weekly: 1, note: '4 drinks per month • max 1 redemption in any 7-day window' },
  plus: { name: 'Plus Pass', price: 22, credits: 8, weekly: 2, note: '8 drinks per month • max 2 redemptions in any 7-day window' }
}

function periodExpired(sub) {
  if (!sub?.current_period_end) return false
  const end = new Date(`${sub.current_period_end}T00:00:00`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return end <= today
}

export default function PsssSubscriptionCenter() {
  const [authorized, setAuthorized] = useState(false)
  const [role, setRole] = useState('employee')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [subscriptions, setSubscriptions] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [tab, setTab] = useState('active')
  const [creating, setCreating] = useState(false)
  const [subscriber, setSubscriber] = useState('')
  const [plan, setPlan] = useState('weekly')
  const [method, setMethod] = useState('Cash')
  const [account, setAccount] = useState('SS Cash')
  const [notes, setNotes] = useState('')
  const [redeeming, setRedeeming] = useState(null)
  const [redeemPid, setRedeemPid] = useState('')
  const [renewing, setRenewing] = useState(null)
  const [renewMethod, setRenewMethod] = useState('Cash')
  const [renewAccount, setRenewAccount] = useState('SS Cash')

  useEffect(() => {
    let mounted = true
    const syncAuth = async session => {
      if (!mounted) return
      setAuthorized(Boolean(session))
      if (!session) { setOpen(false); return }
      const { data } = await supabase.from('ops_profiles').select('role').eq('id', session.user.id).maybeSingle()
      if (mounted && data?.role) setRole(data.role)
    }
    supabase.auth.getSession().then(({ data }) => syncAuth(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => syncAuth(session))
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => { if (open && authorized) load() }, [open, authorized])

  async function load() {
    setLoading(true); setError('')
    try {
      const [s, r, p, o, oi] = await Promise.all([
        supabase.from('ops_psss_subscriptions').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('ops_psss_subscription_redemptions').select('*').order('redeemed_at', { ascending: false }).limit(1500),
        supabase.from('ops_products').select('*').eq('business_unit', 'PSSS').eq('active', true).order('name'),
        supabase.from('ops_psss_orders').select('id,fulfillment_status').eq('fulfillment_status', 'preorder').limit(500),
        supabase.from('ops_psss_order_items').select('order_id,product_id,quantity').limit(3000)
      ])
      for (const q of [s, r, p, o, oi]) if (q.error) throw q.error
      setSubscriptions(s.data || [])
      setRedemptions(r.data || [])
      setProducts(p.data || [])
      setOrders(o.data || [])
      setOrderItems(oi.data || [])
      if (!redeemPid && p.data?.length) setRedeemPid(p.data[0].id)
    } catch (e) {
      setError(e.message || 'Could not load drink passes.')
    } finally { setLoading(false) }
  }

  const reservedByProduct = useMemo(() => {
    const openIds = new Set(orders.map(o => o.id))
    const out = {}
    orderItems.forEach(item => {
      if (openIds.has(item.order_id)) out[item.product_id] = (out[item.product_id] || 0) + Number(item.quantity || 0)
    })
    return out
  }, [orders, orderItems])

  const available = p => Math.max(0, Number(p?.current_stock || 0) - Number(reservedByProduct[p?.id] || 0))

  const recentBySub = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const out = {}
    redemptions.forEach(r => {
      if (new Date(r.redeemed_at).getTime() >= cutoff) out[r.subscription_id] = (out[r.subscription_id] || 0) + 1
    })
    return out
  }, [redemptions])

  const active = subscriptions.filter(s => s.status === 'active' && !periodExpired(s))
  const expired = subscriptions.filter(s => s.status !== 'cancelled' && periodExpired(s))
  const paused = subscriptions.filter(s => s.status === 'paused' && !periodExpired(s))
  const cancelled = subscriptions.filter(s => s.status === 'cancelled')
  const activeCredits = active.reduce((sum, s) => sum + Number(s.credits_remaining || 0), 0)
  const recurring = active.reduce((sum, s) => sum + Number(s.monthly_price || 0), 0)
  const recentRedeems = redemptions.filter(r => new Date(r.redeemed_at).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000).length

  const filtered = tab === 'active' ? active : tab === 'expired' ? expired : tab === 'paused' ? paused : cancelled

  async function createPass(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc('ops_create_psss_subscription', {
        p_subscriber_name: subscriber,
        p_plan_code: plan,
        p_payment_method: method,
        p_account: account,
        p_notes: notes || null
      })
      if (rpcError) throw rpcError
      setNotice(`${data?.pass_code || 'Pass'} created. ${money(plans[plan].price)} was recorded to ${account}.`)
      setSubscriber(''); setNotes(''); setPlan('weekly'); setMethod('Cash'); setAccount('SS Cash'); setCreating(false)
      await load()
    } catch (e2) { setError(e2.message || 'Could not create pass.') }
    finally { setBusy(false) }
  }

  async function redeem() {
    if (!redeeming || busy) return
    const p = products.find(x => x.id === redeemPid)
    if (!p) return setError('Choose a drink first.')
    if (available(p) < 1) return setError(`${p.name} has no unreserved stock available.`)
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('ops_redeem_psss_subscription', {
        p_subscription_id: redeeming.id,
        p_product_id: p.id,
        p_notes: null
      })
      if (rpcError) throw rpcError
      setNotice(`${redeeming.subscriber_name} redeemed 1 ${p.name}. Inventory and COGS were updated automatically.`)
      setRedeeming(null)
      await load()
    } catch (e) { setError(e.message || 'Could not redeem drink.') }
    finally { setBusy(false) }
  }

  async function renew() {
    if (!renewing || busy) return
    if (!window.confirm(`Renew ${renewing.subscriber_name}'s ${renewing.plan_name} for ${money(renewing.monthly_price)}? This starts a fresh month today and resets the drink credits.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('ops_renew_psss_subscription', {
        p_subscription_id: renewing.id,
        p_payment_method: renewMethod,
        p_account: renewAccount
      })
      if (rpcError) throw rpcError
      setNotice(`${renewing.subscriber_name}'s pass was renewed. Payment and new monthly credits were recorded.`)
      setRenewing(null)
      await load()
    } catch (e) { setError(e.message || 'Could not renew pass.') }
    finally { setBusy(false) }
  }

  async function setStatus(sub, status) {
    const action = status === 'cancelled' ? 'cancel' : status === 'paused' ? 'pause' : 'resume'
    if (status === 'cancelled' && !window.confirm(`Cancel ${sub.subscriber_name}'s pass? This does not issue a refund.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('ops_set_psss_subscription_status', { p_subscription_id: sub.id, p_status: status })
      if (rpcError) throw rpcError
      setNotice(`${sub.subscriber_name}'s pass was ${action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : 'resumed'}.`)
      await load()
    } catch (e) { setError(e.message || `Could not ${action} pass.`) }
    finally { setBusy(false) }
  }

  function openRedeem(sub) {
    setError(''); setNotice(''); setRedeeming(sub)
    const first = products.find(p => available(p) > 0)
    setRedeemPid(first?.id || products[0]?.id || '')
  }

  function redeemBlockedReason(sub) {
    if (sub.status !== 'active') return 'Pass is not active'
    if (periodExpired(sub)) return 'Period ended — renew first'
    if (Number(sub.credits_remaining || 0) <= 0) return 'No credits remaining'
    if (Number(recentBySub[sub.id] || 0) >= Number(sub.weekly_limit || 0)) return '7-day redemption limit reached'
    return ''
  }

  if (!authorized) return null

  return <>
    <button
      className="btn"
      onClick={() => setOpen(true)}
      style={{ position: 'fixed', right: 18, bottom: 134, zIndex: 8990, boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}
      aria-label="Open PSSS drink subscriptions"
    >
      <Ticket size={17}/> Passes {active.length ? `(${active.length})` : ''}
    </button>

    {open && <div className="modalback" style={{ zIndex: 9600 }} onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" style={{ width: 'min(1080px, calc(100vw - 24px))', maxWidth: 1080, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modalhead">
          <div><h2 style={{ marginBottom: 2 }}>PSSS Drink Passes</h2><div className="small muted">Monthly prepaid drink subscriptions. Payments, credits, inventory and COGS update automatically.</div></div>
          <button className="iconbtn" onClick={() => setOpen(false)}><X size={18}/></button>
        </div>

        <div className="actions" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn primary" onClick={() => { setCreating(true); setError(''); setNotice('') }}><Plus size={15}/> New subscriber</button>
          <button className="btn" onClick={load} disabled={loading}><RefreshCw size={15}/> {loading ? 'Loading…' : 'Refresh'}</button>
        </div>

        <div className="grid metrics" style={{ marginBottom: 14 }}>
          <div className="metric"><div className="label">Active passes</div><div className="value">{active.length}</div><div className="sub">Currently usable</div></div>
          <div className="metric"><div className="label">Monthly recurring</div><div className="value">{money(recurring)}</div><div className="sub">If all active passes renew</div></div>
          <div className="metric"><div className="label">Credits remaining</div><div className="value">{activeCredits}</div><div className="sub">Across active passes</div></div>
          <div className="metric"><div className="label">Redeemed last 7 days</div><div className="value">{recentRedeems}</div><div className="sub">All subscribers</div></div>
        </div>

        <div className="grid twocol" style={{ marginBottom: 14 }}>
          {Object.entries(plans).map(([code, p]) => <div className="card" key={code} style={{ padding: 14 }}>
            <div className="sectionhead"><h3>{p.name}</h3><strong>{money(p.price)}/month</strong></div>
            <div>{p.credits} drink credits</div><div className="small muted" style={{ marginTop: 5 }}>{p.note}. Unused credits do not roll over.</div>
          </div>)}
        </div>

        {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}
        {error && <div className="notice error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

        {creating && <form onSubmit={createPass} className="card" style={{ marginBottom: 16 }}>
          <div className="sectionhead"><h3>New drink pass</h3><button type="button" className="iconbtn" onClick={() => setCreating(false)}><X size={16}/></button></div>
          <div className="formgrid">
            <Field label="Subscriber name"><input required value={subscriber} onChange={e => setSubscriber(e.target.value)} placeholder="Customer name" /></Field>
            <Field label="Plan"><select value={plan} onChange={e => setPlan(e.target.value)}><option value="weekly">Weekly Pass — $12 / 4 drinks</option><option value="plus">Plus Pass — $22 / 8 drinks</option></select></Field>
            <Field label="Payment method"><select value={method} onChange={e => { const m=e.target.value; setMethod(m); setAccount(methodAccount(m)) }}>{['Cash','Apple Cash','Zelle','Card','Other'].map(m => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Deposit account"><select value={account} onChange={e => setAccount(e.target.value)}>{['SS Cash','SS Bank','Apple Cash','Personal Account','Other'].map(a => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></Field>
          </div>
          <div className="notice" style={{ marginTop: 12 }}>Creating this pass records a cleared {money(plans[plan].price)} subscription payment immediately and starts the first month today.</div>
          <div className="actions" style={{ marginTop: 14, justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : `Create & record ${money(plans[plan].price)}`}</button></div>
        </form>}

        <div className="tabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {[['active',`Active (${active.length})`],['expired',`Expired (${expired.length})`],['paused',`Paused (${paused.length})`],['cancelled',`Cancelled (${cancelled.length})`]].map(([id,label]) => <button key={id} className={`tab ${tab===id?'active':''}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>

        <div className="list">
          {filtered.length ? filtered.map(sub => {
            const blocked = redeemBlockedReason(sub)
            const recent = Number(recentBySub[sub.id] || 0)
            return <div className="rowcard" key={sub.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="title">{sub.subscriber_name} • {sub.plan_name}</div>
                <div className="meta">{sub.pass_code} • {money(sub.monthly_price)}/mo • {sub.credits_remaining}/{sub.monthly_credits} credits left</div>
                <div className="small muted" style={{ marginTop: 5 }}>Period {dateLabel(sub.current_period_start)} → {dateLabel(sub.current_period_end)} • {recent}/{sub.weekly_limit} used in the last 7 days</div>
                {blocked && sub.status !== 'cancelled' && <div className="small" style={{ marginTop: 5 }}>{blocked}</div>}
              </div>
              <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {sub.status !== 'cancelled' && <button className="btn sm good" disabled={busy || Boolean(blocked)} onClick={() => openRedeem(sub)}><CheckCircle2 size={14}/> Redeem</button>}
                {sub.status !== 'cancelled' && <button className="btn sm" disabled={busy} onClick={() => { setRenewing(sub); setRenewMethod(sub.payment_method || 'Cash'); setRenewAccount(sub.account || 'SS Cash'); setError(''); setNotice('') }}><RotateCcw size={14}/> Renew</button>}
                {(role === 'owner' || role === 'manager') && sub.status === 'active' && <button className="btn sm" disabled={busy} onClick={() => setStatus(sub,'paused')}><Pause size={14}/> Pause</button>}
                {(role === 'owner' || role === 'manager') && sub.status === 'paused' && <button className="btn sm" disabled={busy} onClick={() => setStatus(sub,'active')}><Play size={14}/> Resume</button>}
                {(role === 'owner' || role === 'manager') && sub.status !== 'cancelled' && <button className="btn sm danger" disabled={busy} onClick={() => setStatus(sub,'cancelled')}><Ban size={14}/> Cancel</button>}
              </div>
            </div>
          }) : <div className="empty">No passes in this section.</div>}
        </div>

        {redeeming && <div className="modalback" style={{ zIndex: 9700 }} onMouseDown={e => e.target === e.currentTarget && setRedeeming(null)}>
          <div className="modal" style={{ width: 'min(520px, calc(100vw - 28px))' }}>
            <div className="modalhead"><div><h3>Redeem a drink</h3><div className="small muted">{redeeming.subscriber_name} • {redeeming.credits_remaining} credits remaining</div></div><button className="iconbtn" onClick={() => setRedeeming(null)}><X size={16}/></button></div>
            <Field label="Drink"><select value={redeemPid} onChange={e => setRedeemPid(e.target.value)}>{products.map(p => <option key={p.id} value={p.id} disabled={available(p)<1}>{p.name} — {available(p)} available ({p.current_stock} physical)</option>)}</select></Field>
            <div className="small muted" style={{ marginTop: 10 }}>Redeeming removes one drink from inventory and one credit from the pass. It does not record new revenue because the monthly pass was already paid.</div>
            <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button className="btn" onClick={() => setRedeeming(null)}>Cancel</button><button className="btn primary" disabled={busy || !redeemPid} onClick={redeem}>{busy ? 'Redeeming…' : 'Redeem 1 drink'}</button></div>
          </div>
        </div>}

        {renewing && <div className="modalback" style={{ zIndex: 9700 }} onMouseDown={e => e.target === e.currentTarget && setRenewing(null)}>
          <div className="modal" style={{ width: 'min(520px, calc(100vw - 28px))' }}>
            <div className="modalhead"><div><h3>Renew drink pass</h3><div className="small muted">{renewing.subscriber_name} • {renewing.plan_name} • {money(renewing.monthly_price)}</div></div><button className="iconbtn" onClick={() => setRenewing(null)}><X size={16}/></button></div>
            <div className="formgrid">
              <Field label="Payment method"><select value={renewMethod} onChange={e => { const m=e.target.value; setRenewMethod(m); setRenewAccount(methodAccount(m)) }}>{['Cash','Apple Cash','Zelle','Card','Other'].map(m => <option key={m}>{m}</option>)}</select></Field>
              <Field label="Deposit account"><select value={renewAccount} onChange={e => setRenewAccount(e.target.value)}>{['SS Cash','SS Bank','Apple Cash','Personal Account','Other'].map(a => <option key={a}>{a}</option>)}</select></Field>
            </div>
            <div className="notice" style={{ marginTop: 12 }}>Renewing records {money(renewing.monthly_price)} as collected subscription revenue, starts a fresh month today, and resets the pass to {renewing.monthly_credits} credits. Unused credits do not roll over.</div>
            <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button className="btn" onClick={() => setRenewing(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={renew}>{busy ? 'Renewing…' : `Record ${money(renewing.monthly_price)} & renew`}</button></div>
          </div>
        </div>}
      </div>
    </div>}
  </>
}
