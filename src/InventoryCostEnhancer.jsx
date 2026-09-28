import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import { triggerSync } from './lib/api'

const money = n => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(n || 0))

export default function InventoryCostEnhancer() {
  const [page,setPage] = useState(() => location.hash)
  const [target,setTarget] = useState(null)
  const [open,setOpen] = useState(false)
  const [products,setProducts] = useState([])
  const [accounts,setAccounts] = useState([])
  const [form,setForm] = useState({ product_id:'', quantity:'', total_cost:'', account:'SS Cash', notes:'' })
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')

  useEffect(() => {
    const onHash = () => setPage(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!page.includes('#/inventory')) { setTarget(null); return }
    const scan = () => setTarget(document.querySelector('.main .topbar .actions'))
    scan()
    const timer = setInterval(scan, 350)
    return () => clearInterval(timer)
  }, [page])

  // Keep the old stock-adjustment dialog for corrections/waste only.
  // Purchases must go through the cost-aware flow below so average cost stays accurate.
  useEffect(() => {
    const patch = () => {
      document.querySelectorAll('.modal').forEach(modal => {
        if (modal.querySelector('h2')?.textContent?.trim() !== 'Adjust inventory') return
        const fields = [...modal.querySelectorAll('.field')]
        const movementField = fields.find(f => f.querySelector('label')?.textContent?.trim() === 'Movement type')
        const select = movementField?.querySelector('select')
        if (select) {
          const purchase = [...select.options].find(o => o.value === 'purchase')
          if (purchase) purchase.remove()
          if (!select.value || select.value === 'purchase') {
            select.value = 'adjustment'
            select.dispatchEvent(new Event('change', { bubbles:true }))
          }
        }
        if (!modal.querySelector('[data-cost-note]')) {
          const note = document.createElement('div')
          note.dataset.costNote = '1'
          note.className = 'small muted'
          note.style.marginTop = '8px'
          note.textContent = 'Buying inventory? Use “Purchase stock” so quantity, expense, and weighted-average cost are recorded together.'
          modal.querySelector('form')?.appendChild(note)
        }
      })
    }
    patch()
    const observer = new MutationObserver(patch)
    observer.observe(document.body,{ childList:true, subtree:true })
    return () => observer.disconnect()
  }, [])

  const load = async () => {
    const [{data:p,error:pe},{data:a,error:ae}] = await Promise.all([
      supabase.from('ops_products').select('id,business_unit,name,current_stock,unit_cost,active').eq('active',true).order('business_unit').order('name'),
      supabase.from('ops_account_balances').select('account,balance').order('account')
    ])
    if (pe) throw pe
    if (ae) throw ae
    setProducts(p || [])
    setAccounts(a || [])
    setForm(v => ({ ...v, product_id:v.product_id || p?.[0]?.id || '', account:(a || []).some(x=>x.account==='SS Cash') ? 'SS Cash' : (a?.[0]?.account || 'SS Cash') }))
  }

  const openModal = async () => {
    setError('')
    try { await load(); setOpen(true) } catch(e) { setError(e.message || String(e)); setOpen(true) }
  }

  const selected = products.find(p => p.id === form.product_id)
  const estimatedAverage = useMemo(() => {
    const qty = Number(form.quantity)
    const cost = Number(form.total_cost)
    if (!selected || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) return null
    return ((Number(selected.current_stock || 0) * Number(selected.unit_cost || 0)) + cost) / (Number(selected.current_stock || 0) + qty)
  }, [selected,form.quantity,form.total_cost])

  const save = async e => {
    e.preventDefault()
    const quantity = Number(form.quantity)
    const totalCost = Number(form.total_cost)
    if (!form.product_id) return setError('Choose a product.')
    if (!Number.isInteger(quantity) || quantity <= 0) return setError('Quantity must be a positive whole number.')
    if (!Number.isFinite(totalCost) || totalCost < 0) return setError('Enter the total amount paid for this purchase.')
    if (!form.account) return setError('Choose the account used to pay.')
    setBusy(true); setError('')
    const { error } = await supabase.rpc('ops_purchase_inventory', {
      p_product_id: form.product_id,
      p_quantity: quantity,
      p_total_cost: Number(totalCost.toFixed(2)),
      p_account: form.account,
      p_notes: form.notes || null
    })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    await triggerSync()
    window.dispatchEvent(new Event('swiftsupply-balance-changed'))
    setBusy(false)
    setOpen(false)
    // OpsV2 owns the inventory table state, so refresh once after a purchase to show the new live values.
    setTimeout(() => location.reload(), 120)
  }

  return <>
    {target && createPortal(<button type="button" className="btn primary" onClick={openModal}>+ Purchase stock</button>, target)}
    {open && createPortal(<div className="modalback" onMouseDown={e => e.target===e.currentTarget && !busy && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modalhead"><h2>Purchase stock</h2><button type="button" className="iconbtn" disabled={busy} onClick={()=>setOpen(false)}>×</button></div>
        <form onSubmit={save}>
          <div className="formgrid">
            <div className="field"><label>Product</label><select required value={form.product_id} onChange={e=>setForm(v=>({...v,product_id:e.target.value}))}>{products.map(p=><option key={p.id} value={p.id}>{p.business_unit==='SS'?'Vending':p.business_unit} • {p.name} ({p.current_stock} in stock)</option>)}</select></div>
            <div className="field"><label>Units purchased</label><input type="number" min="1" step="1" required value={form.quantity} onChange={e=>setForm(v=>({...v,quantity:e.target.value}))} /></div>
            <div className="field"><label>Total purchase cost</label><input type="number" min="0" step="0.01" required value={form.total_cost} onChange={e=>setForm(v=>({...v,total_cost:e.target.value}))} placeholder="55.00" /></div>
            <div className="field"><label>Paid from</label><select value={form.account} onChange={e=>setForm(v=>({...v,account:e.target.value}))}>{accounts.map(a=><option key={a.account} value={a.account}>{a.account} — {money(a.balance)}</option>)}</select></div>
            <div className="field span2"><label>Notes</label><input value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} placeholder="Store, receipt, case size, etc." /></div>
          </div>
          {selected && <div className="notice" style={{marginTop:12}}>
            <strong>{selected.name}</strong>: current stock {selected.current_stock} • current average cost {money(selected.unit_cost)}
            {estimatedAverage !== null && <> • new average after purchase <strong>{money(estimatedAverage)}</strong></>}
          </div>}
          <p className="small muted">This is rolling inventory. New stock is mixed with what is already left. The system updates the weighted-average cost and records the purchase expense automatically.</p>
          {error && <div className="notice error">{error}</div>}
          <div className="actions" style={{marginTop:16,justifyContent:'flex-end'}}><button type="button" className="btn" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy?'Saving…':'Record purchase'}</button></div>
        </form>
      </div>
    </div>,document.body)}
  </>
}
