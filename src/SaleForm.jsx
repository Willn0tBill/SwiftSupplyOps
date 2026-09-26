import React, { useRef, useState } from 'react'
import { catalogTotal, cents, saleItems } from './lib/sale'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>

export default function SaleForm({ data, onClose, onSave, busy, error }) {
  const products = data.products.filter(p => p.business_unit === 'PSSS' && p.active)
  const [lines, setLines] = useState([])
  const [pid, setPid] = useState(products[0]?.id || '')
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
  const subtotal = lines.reduce((sum, line) => sum + line.catalogCents, 0)
  const total = override === '' ? subtotal : cents(override)
  const collected = pay === 'paid' ? total : pay === 'partial' ? cents(partial) : 0

  function add() {
    const product = products.find(p => p.id === pid)
    const quantity = Number(qty)
    const existing = lines.find(l => l.product_id === pid)?.quantity || 0
    if (!product) return setValidation('Choose a product first.')
    if (!Number.isSafeInteger(quantity) || quantity < 1) return setValidation('Quantity must be a positive whole number.')
    if (existing + quantity > product.current_stock) return setValidation(`Only ${product.current_stock} ${product.name} available, including items already added.`)
    const next = { product_id: pid, name: product.name, quantity: existing + quantity, catalogCents: catalogTotal(product, existing + quantity) }
    setLines([...lines.filter(l => l.product_id !== pid), next])
    setValidation('')
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || submitting.current) return
    try {
      if (!Number.isFinite(total) || total < 0 || (override !== '' && Math.abs(Number(override) * 100 - total) > 0.000001)) throw new Error('Enter a non-negative total with at most two decimal places.')
      if (!Number.isFinite(collected) || collected < 0 || collected > total) throw new Error('Amount collected must be between zero and the sale total.')
      if (pay === 'partial' && (collected <= 0 || collected >= total)) throw new Error('For a partial payment, enter an amount greater than zero and less than the total.')
      const values = { items: saleItems(lines, total), total: total / 100, collected: collected / 100, payment_status: pay, payment_method: method, account, buyer_place: buyer, notes }
      const fingerprint = JSON.stringify(values)
      if (attempt.current && attempt.current.fingerprint !== fingerprint) throw new Error('A save was already attempted. Retry the unchanged sale, or close this form and check Recent sales before starting a different sale.')
      if (!attempt.current) attempt.current = { fingerprint, id: crypto.randomUUID() }
      setValidation('')
      submitting.current = true
      await onSave({ ...values, request_id: attempt.current.id })
    } catch (e) { setValidation(e.message) }
    finally { submitting.current = false }
  }

  return <div className="modalback"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="sale-title">
    <div className="modalhead"><h2 id="sale-title">Log PSSS sale</h2><button type="button" className="iconbtn" aria-label="Close sale" disabled={busy} onClick={onClose}>×</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <p className="small muted">Choose a product and quantity, then add it to the sale.</p>
        <div className="formgrid">
          <Field label="Product"><select value={pid} onChange={e => setPid(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} left)</option>)}</select></Field>
          <Field label="Quantity"><input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} /></Field>
        </div>
        <button type="button" className="btn" style={{ marginTop: 10 }} onClick={add}>Add item to sale</button>
        {!lines.length && <p className="small muted">No items added yet. Add an item to enable Save Sale.</p>}
        <div className="list" style={{ marginTop: 12 }}>{lines.map(line => <div className="rowcard" key={line.product_id}>
          <div>{line.quantity} × {line.name}</div><div>{money(line.catalogCents / 100)} <button type="button" className="btn sm danger" aria-label={`Remove ${line.name}`} onClick={() => setLines(lines.filter(l => l.product_id !== line.product_id))}>Remove</button></div>
        </div>)}</div>
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
        <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary" disabled={busy || !lines.length}>{busy ? 'Saving…' : `Save ${money(total / 100)} sale`}</button></div>
      </fieldset>
    </form>
  </div></div>
}
