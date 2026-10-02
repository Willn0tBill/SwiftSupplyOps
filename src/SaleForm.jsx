import React, { useEffect, useRef, useState } from 'react'
import { catalogTotal, cents, saleItems } from './lib/sale'
import { supabase } from './lib/supabase'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>

export default function SaleForm({ data, onClose, onSave, busy, error }) {
  const products = data.products.filter(p => p.business_unit === 'PSSS' && p.active)
  const [variants,setVariants] = useState([])
  const [lines, setLines] = useState([])
  const [pid, setPid] = useState(products[0]?.id || '')
  const [vid, setVid] = useState('')
  const [qty, setQty] = useState('1')
  const [pay, setPay] = useState('paid')
  const [method, setMethod] = useState('Cash')
  const [account, setAccount] = useState('SS Cash')
  const [override, setOverride] = useState('')
  const [partial, setPartial] = useState('')
  const [buyer, setBuyer] = useState('')
  const [notes, setNotes] = useState('')
  const [validation, setValidation] = useState('')
  const submitting = useRef(false)
  const attempt = useRef(null)

  useEffect(() => {
    let mounted = true
    supabase.from('ops_product_variants').select('id,product_id,flavor,current_stock,active').eq('active',true).order('flavor').then(({data,error}) => {
      if (!mounted) return
      if (!error) setVariants(data || [])
    })
    return () => { mounted = false }
  }, [])

  const selectedProduct = products.find(p => p.id === pid)
  const selectedVariants = variants.filter(v => v.product_id === pid)
  const selectedVariant = selectedVariants.find(v => v.id === vid)
  const assignedStock = selectedVariants.reduce((sum,v) => sum + Number(v.current_stock || 0), 0)
  const unassignedStock = Math.max(0, Number(selectedProduct?.current_stock || 0) - assignedStock)

  useEffect(() => {
    if (!selectedVariants.length) { if (vid) setVid(''); return }
    if (vid && !selectedVariants.some(v => v.id === vid)) setVid('')
  }, [pid,variants,vid,selectedVariants.length])

  function selectedLine() {
    const product = products.find(p => p.id === pid)
    const quantity = Number(qty)
    if (!product) throw new Error('Choose a product first.')
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.')
    if (selectedVariants.length) {
      if (selectedVariant) {
        if (quantity > Number(selectedVariant.current_stock || 0)) throw new Error(`Only ${selectedVariant.current_stock} ${selectedVariant.flavor} available before reservations.`)
      } else if (quantity > unassignedStock) {
        throw new Error(`Only ${unassignedStock} unassigned ${product.name} available. Assign flavor stock or choose a flavor that has inventory.`)
      }
    } else if (quantity > Number(product.current_stock || 0)) {
      throw new Error(`Only ${product.current_stock} ${product.name} available.`)
    }
    return {
      product_id: pid,
      ...(selectedVariant ? { variant_id:selectedVariant.id } : {}),
      name: selectedVariant ? `${product.name} — ${selectedVariant.flavor}` : selectedVariants.length ? `${product.name} — flavor not logged` : product.name,
      quantity,
      catalogCents: catalogTotal(product, quantity)
    }
  }

  const previewLines = lines.length ? lines : (() => { try { return [selectedLine()] } catch { return [] } })()
  const subtotal = previewLines.reduce((sum, line) => sum + line.catalogCents, 0)
  const total = override === '' ? subtotal : cents(override)
  const collected = pay === 'paid' ? total : pay === 'partial' ? cents(partial) : 0

  function add() {
    try {
      const product = products.find(p => p.id === pid)
      const quantity = Number(qty)
      if (!product) throw new Error('Choose a product first.')
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number.')
      const variant = variants.find(v => v.id === vid && v.product_id === pid)
      const key = `${pid}:${variant?.id || ''}`
      const existing = lines.find(l => `${l.product_id}:${l.variant_id || ''}` === key)?.quantity || 0
      const limit = variant ? Number(variant.current_stock || 0) : selectedVariants.length ? unassignedStock : Number(product.current_stock || 0)
      if (existing + quantity > limit) throw new Error(`Only ${limit} ${variant?.flavor || (selectedVariants.length ? 'unassigned cans' : product.name)} available before reservations.`)
      const nextQty = existing + quantity
      const next = {
        product_id: pid,
        ...(variant ? { variant_id:variant.id } : {}),
        name: variant ? `${product.name} — ${variant.flavor}` : selectedVariants.length ? `${product.name} — flavor not logged` : product.name,
        quantity: nextQty,
        catalogCents: catalogTotal(product, nextQty)
      }
      setLines([...lines.filter(l => `${l.product_id}:${l.variant_id || ''}` !== key), next])
      setValidation('')
    } catch (e) {
      setValidation(e.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || submitting.current) return
    try {
      const effectiveLines = lines.length ? lines : [selectedLine()]
      const effectiveSubtotal = effectiveLines.reduce((sum, line) => sum + line.catalogCents, 0)
      const effectiveTotal = override === '' ? effectiveSubtotal : cents(override)
      const effectiveCollected = pay === 'paid' ? effectiveTotal : pay === 'partial' ? cents(partial) : 0

      if (!Number.isFinite(effectiveTotal) || effectiveTotal < 0 || (override !== '' && Math.abs(Number(override) * 100 - effectiveTotal) > 0.000001)) throw new Error('Enter a non-negative total with at most two decimal places.')
      if (!Number.isFinite(effectiveCollected) || effectiveCollected < 0 || effectiveCollected > effectiveTotal) throw new Error('Amount collected must be between zero and the sale total.')
      if (pay === 'partial' && (effectiveCollected <= 0 || effectiveCollected >= effectiveTotal)) throw new Error('For a partial payment, enter an amount greater than zero and less than the total.')

      const values = {
        items: saleItems(effectiveLines, effectiveTotal),
        total: effectiveTotal / 100,
        collected: effectiveCollected / 100,
        payment_status: pay,
        payment_method: method,
        account,
        buyer_place: buyer,
        notes
      }
      const fingerprint = JSON.stringify(values)
      if (attempt.current && attempt.current.fingerprint !== fingerprint) throw new Error('A save was already attempted. Retry the unchanged sale, or close this form and check Recent sales before starting a different sale.')
      if (!attempt.current) attempt.current = { fingerprint, id: crypto.randomUUID() }
      setValidation('')
      submitting.current = true
      await onSave({ ...values, request_id: attempt.current.id })
    } catch (e) {
      setValidation(e.message)
    } finally {
      submitting.current = false
    }
  }

  return <div className="modalback"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="sale-title">
    <div className="modalhead"><h2 id="sale-title">Log PSSS sale</h2><button type="button" className="iconbtn" aria-label="Close sale" disabled={busy} onClick={onClose}>×</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <p className="small muted">Choose a flavor when you have already counted it. If your Monster total is correct but the flavor has not been entered yet, use “Flavor not logged / unassigned” and the sale will still reduce the overall Monster stock.</p>
        <div className="formgrid">
          <Field label="Product"><select value={pid} onChange={e => { setPid(e.target.value); setVid('') }}>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} total)</option>)}</select></Field>
          {selectedVariants.length > 0 && <Field label="Flavor"><select value={vid} onChange={e=>setVid(e.target.value)}><option value="" disabled={unassignedStock < 1}>Flavor not logged / unassigned ({unassignedStock} available)</option>{selectedVariants.map(v=><option key={v.id} value={v.id} disabled={Number(v.current_stock)<1}>{v.flavor} ({v.current_stock} physical)</option>)}</select></Field>}
          <Field label="Quantity"><input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} /></Field>
        </div>
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={add}>Add item to sale</button>
        {!lines.length && <p className="small muted">Current selection will be included automatically when you press Save.</p>}
        <div className="list" style={{ marginTop: 12 }}>{lines.map(line => {
          const key=`${line.product_id}:${line.variant_id || ''}`
          return <div className="rowcard" key={key}>
            <div>{line.quantity} × {line.name}</div><div>{money(line.catalogCents / 100)} <button type="button" className="btn sm danger" aria-label={`Remove ${line.name}`} onClick={() => setLines(lines.filter(l => `${l.product_id}:${l.variant_id || ''}` !== key))}>Remove</button></div>
          </div>
        })}</div>
        <div className="formgrid" style={{ marginTop: 14 }}>
          <Field label="Sale total (optional custom price)"><input type="number" min="0" step="0.01" placeholder={(subtotal / 100).toFixed(2)} value={override} onChange={e => setOverride(e.target.value)} /></Field>
          <Field label="Payment status"><select value={pay} onChange={e => setPay(e.target.value)}><option value="paid">Paid</option><option value="pending">Pending / owed</option><option value="partial">Partial</option></select></Field>
          {pay === 'partial' && <Field label="Amount collected now"><input required type="number" min="0.01" max={Math.max(0, (total - 1) / 100)} step="0.01" value={partial} onChange={e => setPartial(e.target.value)} /></Field>}
          <Field label="Payment method"><select value={method} onChange={e => { setMethod(e.target.value); setAccount(e.target.value === 'Apple Cash' ? 'Apple Cash' : ['Card', 'Zelle'].includes(e.target.value) ? 'SS Bank' : e.target.value === 'Other' ? 'Other' : 'SS Cash') }}>{['Cash', 'Apple Cash', 'Zelle', 'Card', 'Other'].map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Deposit account"><select value={account} onChange={e => setAccount(e.target.value)}>{['SS Cash', 'SS Bank', 'Apple Cash', 'Personal Account', 'Other'].map(a => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Buyer / place"><input value={buyer} onChange={e => setBuyer(e.target.value)} /></Field>
          <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>
        <p>Total: <strong>{money(total / 100)}</strong> · Collected: {money(collected / 100)} · Owed: {money(Math.max(0, total - collected) / 100)}</p>
        {override !== '' && <p className="small muted">Custom price is allocated across the items to the cent.</p>}
        {validation && <div className="notice error" role="alert">{validation}</div>}{error}
        <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy || !products.length}>{busy ? 'Saving…' : `Save ${money(total / 100)} sale`}</button></div>
      </fieldset>
    </form>
  </div></div>
}
