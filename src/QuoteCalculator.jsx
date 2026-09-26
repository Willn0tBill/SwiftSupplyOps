import React, { useEffect, useMemo, useState } from 'react'
import { Calculator, Copy, Save, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import * as api from './lib/api'
import './quote-calculator.css'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))
const round5 = n => Math.ceil(Number(n || 0) / 5) * 5

const presets = {
  driveway: { label: 'Driveway / Concrete', rate: 0.20 },
  walkway: { label: 'Walkway / Sidewalk', rate: 0.18 },
  patio: { label: 'Patio / Pool Deck', rate: 0.22 },
  exterior: { label: 'House / Building Exterior', rate: 0.30 },
  commercial: { label: 'Commercial Flatwork', rate: 0.24 },
  custom: { label: 'Custom', rate: 0.20 }
}

export default function QuoteCalculator() {
  const [session, setSession] = useState(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [v, setV] = useState({
    customer: '',
    address: '',
    service: 'driveway',
    squareFeet: 600,
    rate: 0.20,
    condition: 1,
    minimum: 100,
    travel: 0,
    addons: 0,
    discount: 0,
    directCost: 15,
    notes: ''
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const calc = useMemo(() => {
    const sqft = Math.max(0, Number(v.squareFeet || 0))
    const rate = Math.max(0, Number(v.rate || 0))
    const base = sqft * rate
    const conditionAdjusted = base * Number(v.condition || 1)
    const beforeDiscount = conditionAdjusted + Number(v.travel || 0) + Number(v.addons || 0)
    const discountAmount = beforeDiscount * (Math.max(0, Number(v.discount || 0)) / 100)
    const afterDiscount = Math.max(0, beforeDiscount - discountAmount)
    const minimumApplied = Math.max(Number(v.minimum || 0), afterDiscount)
    const quote = round5(minimumApplied)
    const profit = quote - Number(v.directCost || 0)
    const margin = quote > 0 ? (profit / quote) * 100 : 0
    return { base, conditionAdjusted, beforeDiscount, discountAmount, quote, profit, margin }
  }, [v])

  if (!session) return null

  const set = (key, value) => setV(prev => ({ ...prev, [key]: value }))
  const chooseService = key => {
    const p = presets[key]
    setV(prev => ({ ...prev, service: key, rate: p.rate }))
  }

  const summary = () => {
    const p = presets[v.service] || presets.custom
    return `SSPW Quote\nCustomer: ${v.customer || 'Not entered'}\nService: ${p.label}\nArea: ${Number(v.squareFeet || 0).toLocaleString()} sq ft\nRate: $${Number(v.rate || 0).toFixed(2)}/sq ft\nSuggested quote: ${money(calc.quote)}\nEstimated direct cost: ${money(v.directCost)}\nEstimated profit: ${money(calc.profit)} (${calc.margin.toFixed(1)}% margin)${v.notes ? `\nNotes: ${v.notes}` : ''}`
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary())
      setMessage('Quote summary copied.')
    } catch {
      setMessage('Could not copy automatically.')
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const p = presets[v.service] || presets.custom
      await api.createJob({
        business_unit: 'SSPW',
        status: 'quoted',
        title: `${p.label} Quote${v.customer ? ` — ${v.customer}` : ''}`,
        service: p.label,
        estimated_value: calc.quote,
        direct_cost: Number(v.directCost || 0),
        address: v.address || null,
        notes: `Quote calculator: ${Number(v.squareFeet || 0)} sq ft × $${Number(v.rate || 0).toFixed(2)}/sq ft; condition x${Number(v.condition || 1).toFixed(2)}; travel ${money(v.travel)}; add-ons ${money(v.addons)}; discount ${Number(v.discount || 0)}%; minimum ${money(v.minimum)}. Estimated profit ${money(calc.profit)} (${calc.margin.toFixed(1)}% margin).${v.customer ? ` Customer: ${v.customer}.` : ''}${v.notes ? ` ${v.notes}` : ''}`
      })
      setMessage('Saved to SSPW as a quoted job.')
    } catch (e) {
      setMessage(e?.message || 'Could not save quote.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <button className="sspw-quote-fab" onClick={() => setOpen(true)} aria-label="Open SSPW quote calculator">
      <Calculator size={19}/><span>SSPW Quote</span>
    </button>
    {open && <div className="sspw-quote-backdrop" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <section className="sspw-quote-panel">
        <div className="sspw-quote-head">
          <div><h2>SSPW Quote Calculator</h2><p>Build a quick pressure-washing quote and save it directly into Ops.</p></div>
          <button className="sspw-quote-close" onClick={() => setOpen(false)}><X size={20}/></button>
        </div>

        <div className="sspw-quote-layout">
          <div className="sspw-quote-form">
            <label>Customer / business<input value={v.customer} onChange={e => set('customer', e.target.value)} placeholder="Optional"/></label>
            <label>Address<input value={v.address} onChange={e => set('address', e.target.value)} placeholder="Optional"/></label>
            <label>Service<select value={v.service} onChange={e => chooseService(e.target.value)}>{Object.entries(presets).map(([key,p]) => <option value={key} key={key}>{p.label}</option>)}</select></label>
            <div className="sspw-quote-split">
              <label>Square feet<input type="number" min="0" value={v.squareFeet} onChange={e => set('squareFeet', e.target.value)}/></label>
              <label>Rate / sq ft<input type="number" min="0" step="0.01" value={v.rate} onChange={e => set('rate', e.target.value)}/></label>
            </div>
            <label>Condition<select value={v.condition} onChange={e => set('condition', e.target.value)}><option value="1">Normal</option><option value="1.15">Heavy dirt (+15%)</option><option value="1.3">Very heavy (+30%)</option></select></label>
            <div className="sspw-quote-split">
              <label>Minimum charge<input type="number" min="0" step="5" value={v.minimum} onChange={e => set('minimum', e.target.value)}/></label>
              <label>Travel fee<input type="number" min="0" step="5" value={v.travel} onChange={e => set('travel', e.target.value)}/></label>
            </div>
            <div className="sspw-quote-split">
              <label>Add-ons<input type="number" min="0" step="5" value={v.addons} onChange={e => set('addons', e.target.value)}/></label>
              <label>Discount %<input type="number" min="0" max="100" step="1" value={v.discount} onChange={e => set('discount', e.target.value)}/></label>
            </div>
            <label>Estimated direct cost<input type="number" min="0" step="1" value={v.directCost} onChange={e => set('directCost', e.target.value)}/></label>
            <label>Quote notes<textarea value={v.notes} onChange={e => set('notes', e.target.value)} placeholder="Stains, access, customer requests, etc."/></label>
          </div>

          <div className="sspw-quote-result">
            <div className="sspw-quote-total"><span>Suggested quote</span><strong>{money(calc.quote)}</strong><small>Rounded up to the nearest $5</small></div>
            <div className="sspw-breakdown">
              <div><span>Base</span><b>{money(calc.base)}</b></div>
              <div><span>After condition</span><b>{money(calc.conditionAdjusted)}</b></div>
              <div><span>Travel + add-ons</span><b>{money(Number(v.travel || 0) + Number(v.addons || 0))}</b></div>
              <div><span>Discount</span><b>-{money(calc.discountAmount)}</b></div>
              <div><span>Est. direct cost</span><b>{money(v.directCost)}</b></div>
              <div className="profit"><span>Est. profit</span><b>{money(calc.profit)}</b></div>
              <div><span>Est. margin</span><b>{calc.margin.toFixed(1)}%</b></div>
            </div>
            <div className="sspw-quote-note">Rates are editable starting points. Always adjust for the actual property, access, surface condition, and work required.</div>
            {message && <div className="sspw-quote-message">{message}</div>}
            <div className="sspw-quote-actions">
              <button onClick={copy}><Copy size={16}/> Copy quote</button>
              <button className="primary" disabled={saving} onClick={save}><Save size={16}/> {saving ? 'Saving…' : 'Save to SSPW'}</button>
            </div>
          </div>
        </div>
      </section>
    </div>}
  </>
}
