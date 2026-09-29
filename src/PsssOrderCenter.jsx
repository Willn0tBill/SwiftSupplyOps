import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart, RefreshCw, X, Plus, CheckCircle2, PackageCheck, Ban } from 'lucide-react'
import { supabase } from './lib/supabase'
import { catalogTotal, cents, saleItems } from './lib/sale'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))
const dt = v => v ? new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>

const methodAccount = method => method === 'Apple Cash' ? 'Apple Cash' : ['Card', 'Zelle'].includes(method) ? 'SS Bank' : method === 'Other' ? 'Other' : 'SS Cash'

export default function PsssOrderCenter() {
  const [authorized, setAuthorized] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [tab, setTab] = useState('open')
  const [mode, setMode] = useState(null)
  const [customer, setCustomer] = useState('')
  const [notes, setNotes] = useState('')
  const [pid, setPid] = useState('')
  const [qty, setQty] = useState('1')
  const [lines, setLines] = useState([])
  const [override, setOverride] = useState('')
  const [method, setMethod] = useState('Cash')
  const [account, setAccount] = useState('SS Cash')
  const requestRef = useRef(null)
  const [paying, setPaying] = useState(null)
  const [payMethod, setPayMethod] = useState('Cash')
  const [payAccount, setPayAccount] = useState('SS Cash')

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => mounted && setAuthorized(Boolean(data.session)))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setAuthorized(Boolean(session))
      if (!session) setOpen(false)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (open && authorized) load()
  }, [open, authorized])

  useEffect(() => {
    if (!pid && products.length) setPid(products[0].id)
  }, [products, pid])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [p, o, i] = await Promise.all([
        supabase.from('ops_products').select('*').eq('business_unit', 'PSSS').eq('active', true).order('name'),
        supabase.from('ops_psss_orders').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('ops_psss_order_items').select('*').order('created_at', { ascending: true }).limit(2000)
      ])
      if (p.error) throw p.error
      if (o.error) throw o.error
      if (i.error) throw i.error
      setProducts(p.data || [])
      setOrders(o.data || [])
      setOrderItems(i.data || [])
    } catch (e) {
      setError(e.message || 'Could not load orders.')
    } finally {
      setLoading(false)
    }
  }

  const itemsByOrder = useMemo(() => {
    const map = new Map()
    orderItems.forEach(item => {
      if (!map.has(item.order_id)) map.set(item.order_id, [])
      map.get(item.order_id).push(item)
    })
    return map
  }, [orderItems])

  const reservedByProduct = useMemo(() => {
    const openIds = new Set(orders.filter(o => o.fulfillment_status === 'preorder').map(o => o.id))
    const map = {}
    orderItems.forEach(item => {
      if (openIds.has(item.order_id)) map[item.product_id] = (map[item.product_id] || 0) + Number(item.quantity || 0)
    })
    return map
  }, [orders, orderItems])

  const productById = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const available = p => Math.max(0, Number(p?.current_stock || 0) - Number(reservedByProduct[p?.id] || 0))

  const openOrders = orders.filter(o => o.fulfillment_status === 'preorder')
  const reservedUnits = Object.values(reservedByProduct).reduce((s, n) => s + Number(n || 0), 0)
  const waitingPickup = orders.filter(o => o.fulfillment_status === 'preorder' && o.payment_status === 'paid').length
  const owed = orders.filter(o => o.fulfillment_status === 'fulfilled' && o.payment_status !== 'paid').reduce((s, o) => s + Number(o.total_amount || 0), 0)

  const filtered = orders.filter(o => {
    if (tab === 'open') return o.fulfillment_status === 'preorder'
    if (tab === 'unpaid') return o.fulfillment_status === 'fulfilled' && o.payment_status !== 'paid'
    if (tab === 'pickup') return o.fulfillment_status === 'preorder' && o.payment_status === 'paid'
    if (tab === 'completed') return o.fulfillment_status === 'fulfilled' && o.payment_status === 'paid'
    if (tab === 'cancelled') return o.fulfillment_status === 'cancelled'
    return true
  })

  const subtotalCents = lines.reduce((sum, line) => sum + line.catalogCents, 0)
  const totalCents = override === '' ? subtotalCents : cents(override)

  function resetComposer(nextMode = null) {
    setMode(nextMode)
    setCustomer('')
    setNotes('')
    setQty('1')
    setLines([])
    setOverride('')
    setMethod('Cash')
    setAccount('SS Cash')
    requestRef.current = nextMode ? crypto.randomUUID() : null
  }

  function addLine() {
    setError('')
    const p = products.find(x => x.id === pid)
    const n = Number(qty)
    if (!p) return setError('Choose a product.')
    if (!Number.isSafeInteger(n) || n < 1) return setError('Quantity must be a positive whole number.')
    const existing = lines.find(l => l.product_id === p.id)?.quantity || 0
    if (existing + n > available(p)) return setError(`Only ${available(p)} ${p.name} available after current preorders.`)
    const nextQty = existing + n
    const next = { product_id: p.id, name: p.name, quantity: nextQty, catalogCents: catalogTotal(p, nextQty) }
    setLines([...lines.filter(l => l.product_id !== p.id), next])
    setQty('1')
  }

  async function saveComposer(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    try {
      if (!lines.length) throw new Error('Add at least one item first.')
      if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('Enter a valid total with no more than two decimal places.')
      const items = saleItems(lines, totalCents)
      setBusy(true)
      if (mode === 'preorder') {
        const { error: rpcError } = await supabase.rpc('ops_create_psss_order', {
          p_items: items,
          p_total: totalCents / 100,
          p_customer_name: customer || null,
          p_notes: notes || null,
          p_request_id: requestRef.current || crypto.randomUUID()
        })
        if (rpcError) throw rpcError
      } else {
        const { error: rpcError } = await supabase.rpc('ops_record_psss_sale', {
          p_items: items,
          p_total: totalCents / 100,
          p_collected: totalCents / 100,
          p_payment_method: method,
          p_payment_status: 'paid',
          p_account: account,
          p_buyer_place: customer || null,
          p_notes: notes || null,
          p_request_id: requestRef.current || crypto.randomUUID()
        })
        if (rpcError) throw rpcError
      }
      resetComposer(null)
      await load()
    } catch (e2) {
      setError(e2.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function markPaid() {
    if (!paying || busy) return
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await supabase.rpc('ops_mark_psss_order_paid', {
        p_order_id: paying.id,
        p_payment_method: payMethod,
        p_account: payAccount
      })
      if (rpcError) throw rpcError
      setPaying(null)
      await load()
    } catch (e) { setError(e.message || 'Could not mark paid.') }
    finally { setBusy(false) }
  }

  async function fulfill(order) {
    if (!window.confirm(`Mark ${order.order_code} as picked up / fulfilled? Inventory will be deducted now.`)) return
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await supabase.rpc('ops_fulfill_psss_order', { p_order_id: order.id })
      if (rpcError) throw rpcError
      await load()
    } catch (e) { setError(e.message || 'Could not fulfill order.') }
    finally { setBusy(false) }
  }

  async function cancel(order) {
    if (!window.confirm(`Cancel ${order.order_code}? Reserved inventory will become available again.`)) return
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await supabase.rpc('ops_cancel_psss_order', { p_order_id: order.id })
      if (rpcError) throw rpcError
      await load()
    } catch (e) { setError(e.message || 'Could not cancel order.') }
    finally { setBusy(false) }
  }

  function orderSummary(order) {
    const grouped = {}
    ;(itemsByOrder.get(order.id) || []).forEach(item => {
      const p = productById[item.product_id]
      const key = item.product_id
      if (!grouped[key]) grouped[key] = { name: p?.name || 'Product', qty: 0 }
      grouped[key].qty += Number(item.quantity || 0)
    })
    return Object.values(grouped).map(x => `${x.qty}× ${x.name}`).join(', ') || 'No items'
  }

  if (!authorized) return null

  return <>
    <button
      className="btn primary"
      onClick={() => setOpen(true)}
      style={{ position: 'fixed', right: 18, bottom: 84, zIndex: 9000, boxShadow: '0 10px 30px rgba(0,0,0,.22)' }}
      aria-label="Open PSSS sales and preorders"
    >
      <ShoppingCart size={17}/> Orders {openOrders.length > 0 ? `(${openOrders.length})` : ''}
    </button>

    {open && <div className="modalback" style={{ zIndex: 9500 }} onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" style={{ width: 'min(1050px, calc(100vw - 24px))', maxWidth: 1050, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modalhead">
          <div><h2 style={{ marginBottom: 2 }}>PSSS Sales & Preorders</h2><div className="small muted">Enter it once. Payment, inventory, receivables and profit update from the order status.</div></div>
          <button className="iconbtn" onClick={() => setOpen(false)}><X size={18}/></button>
        </div>

        <div className="actions" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn primary" onClick={() => resetComposer('preorder')}><Plus size={15}/> New preorder</button>
          <button className="btn" onClick={() => resetComposer('quick')}><ShoppingCart size={15}/> Quick paid sale</button>
          <button className="btn" onClick={load} disabled={loading}><RefreshCw size={15}/> {loading ? 'Loading…' : 'Refresh'}</button>
        </div>

        <div className="grid metrics" style={{ marginBottom: 14 }}>
          <div className="metric"><div className="label">Open preorders</div><div className="value">{openOrders.length}</div><div className="sub">Not fulfilled yet</div></div>
          <div className="metric"><div className="label">Reserved units</div><div className="value">{reservedUnits}</div><div className="sub">Protected from quick sales</div></div>
          <div className="metric"><div className="label">Paid / waiting pickup</div><div className="value">{waitingPickup}</div><div className="sub">Cash already recorded</div></div>
          <div className="metric"><div className="label">Fulfilled but unpaid</div><div className="value">{money(owed)}</div><div className="sub">Current receivables</div></div>
        </div>

        {error && <div className="notice error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

        {mode && <form onSubmit={saveComposer} className="card" style={{ marginBottom: 16 }}>
          <div className="sectionhead"><h3>{mode === 'preorder' ? 'New preorder' : 'Quick paid sale'}</h3><button type="button" className="iconbtn" onClick={() => resetComposer(null)}><X size={16}/></button></div>
          <div className="formgrid">
            <Field label="Customer / buyer"><input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Name (optional)" /></Field>
            <Field label="Product"><select value={pid} onChange={e => setPid(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {available(p)} available ({p.current_stock} physical)</option>)}</select></Field>
            <Field label="Quantity"><input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} /></Field>
            <div className="field"><span>&nbsp;</span><button type="button" className="btn" onClick={addLine}>Add item</button></div>
          </div>

          <div className="list" style={{ marginTop: 10 }}>
            {lines.map(line => <div className="rowcard" key={line.product_id}><div><strong>{line.quantity}× {line.name}</strong><div className="small muted">Catalog {money(line.catalogCents / 100)}</div></div><button type="button" className="btn sm danger" onClick={() => setLines(lines.filter(l => l.product_id !== line.product_id))}>Remove</button></div>)}
          </div>

          <div className="formgrid" style={{ marginTop: 12 }}>
            <Field label="Total (optional custom price)"><input type="number" min="0" step="0.01" placeholder={(subtotalCents / 100).toFixed(2)} value={override} onChange={e => setOverride(e.target.value)} /></Field>
            {mode === 'quick' && <Field label="Payment method"><select value={method} onChange={e => { const m = e.target.value; setMethod(m); setAccount(methodAccount(m)) }}>{['Cash','Apple Cash','Zelle','Card','Other'].map(m => <option key={m}>{m}</option>)}</select></Field>}
            {mode === 'quick' && <Field label="Deposit account"><select value={account} onChange={e => setAccount(e.target.value)}>{['SS Cash','SS Bank','Apple Cash','Personal Account','Other'].map(a => <option key={a}>{a}</option>)}</select></Field>}
            <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={mode === 'preorder' ? 'Pickup details, flavors, etc.' : 'Optional'} /></Field>
          </div>
          <p><strong>Total: {money(totalCents / 100)}</strong>{mode === 'preorder' ? ' • Inventory is reserved now and deducted when picked up.' : ' • Cash and physical inventory update immediately.'}</p>
          <div className="actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => resetComposer(null)}>Cancel</button><button className="btn primary" disabled={busy || !lines.length}>{busy ? 'Saving…' : mode === 'preorder' ? 'Save preorder' : 'Complete paid sale'}</button></div>
        </form>}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="sectionhead"><h3>Available inventory</h3><span className="small muted">Physical − reserved = available to sell</span></div>
          <div className="list">{products.map(p => <div className="rowcard" key={p.id}><div><strong>{p.name}</strong><div className="small muted">Physical {p.current_stock} • Reserved {reservedByProduct[p.id] || 0}</div></div><strong>{available(p)} available</strong></div>)}</div>
        </div>

        <div className="tabs" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {[['open','Open'],['pickup','Paid / pickup'],['unpaid','Unpaid after pickup'],['completed','Completed'],['cancelled','Cancelled']].map(([id,label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>

        <div className="card">
          <div className="list">
            {!filtered.length && <div className="empty">No orders in this section.</div>}
            {filtered.map(order => <div className="rowcard" key={order.id} style={{ alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="title">{order.order_code} • {order.customer_name || 'No customer name'}</div>
                <div className="meta">{orderSummary(order)}</div>
                <div className="small muted">{dt(order.created_at)} • {money(order.total_amount)} • {order.payment_status === 'paid' ? `Paid to ${order.account}` : 'Unpaid'} • {order.fulfillment_status}</div>
                {order.notes && <div className="small" style={{ marginTop: 5 }}>{order.notes}</div>}
              </div>
              <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {order.payment_status !== 'paid' && order.fulfillment_status !== 'cancelled' && <button className="btn sm good" disabled={busy} onClick={() => { setPaying(order); setPayMethod('Cash'); setPayAccount('SS Cash') }}><CheckCircle2 size={14}/> Paid</button>}
                {order.fulfillment_status === 'preorder' && <button className="btn sm primary" disabled={busy} onClick={() => fulfill(order)}><PackageCheck size={14}/> Picked up</button>}
                {order.fulfillment_status === 'preorder' && order.payment_status !== 'paid' && <button className="btn sm danger" disabled={busy} onClick={() => cancel(order)}><Ban size={14}/> Cancel</button>}
              </div>
            </div>)}
          </div>
        </div>
      </div>
    </div>}

    {paying && <div className="modalback" style={{ zIndex: 9800 }} onMouseDown={e => e.target === e.currentTarget && setPaying(null)}>
      <div className="modal" style={{ width: 'min(500px, calc(100vw - 24px))' }}>
        <div className="modalhead"><h2>Mark {paying.order_code} paid</h2><button className="iconbtn" onClick={() => setPaying(null)}><X size={18}/></button></div>
        <p>{paying.customer_name || 'Customer'} paid <strong>{money(paying.total_amount)}</strong>.</p>
        <div className="formgrid">
          <Field label="Payment method"><select value={payMethod} onChange={e => { const m=e.target.value; setPayMethod(m); setPayAccount(methodAccount(m)) }}>{['Cash','Apple Cash','Zelle','Card','Other'].map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Deposit account"><select value={payAccount} onChange={e => setPayAccount(e.target.value)}>{['SS Cash','SS Bank','Apple Cash','Personal Account','Other'].map(a => <option key={a}>{a}</option>)}</select></Field>
        </div>
        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}><button className="btn" onClick={() => setPaying(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={markPaid}>{busy ? 'Saving…' : 'Confirm paid'}</button></div>
      </div>
    </div>}
  </>
}
