import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

const money = n => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(n || 0))
const shortWhen = v => v ? new Date(v).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'
const OPERATING_AREAS = new Set(['Personal Selling','SSPW','SS Vending'])
const accountOrder = ['Personal Account','Investor Funds','SS Cash','SS Bank']
const accountNote = name => ({
  'Personal Account':'Personal / PSSS mixed money',
  'Investor Funds':'Investor capital — not sales',
  'SS Cash':'Physical SwiftSupply cash',
  'SS Bank':'SwiftSupply bank balance'
}[name] || 'Tracked account')

export default function SimpleDashboardEnhancer() {
  const [page, setPage] = useState(() => location.hash)
  const [target, setTarget] = useState(null)
  const [snapshot, setSnapshot] = useState({
    balances:[], transactions:[], products:[], jobs:[], visits:[], events:[], maintenance:[]
  })

  const isHome = page.includes('#/home') || page.endsWith('#/') || !page.includes('#/')

  const load = async () => {
    const results = await Promise.all([
      supabase.from('ops_account_balances').select('*').order('account'),
      supabase.from('ops_transactions').select('*').order('occurred_at', { ascending:false }).limit(500),
      supabase.from('ops_products').select('*').order('business_unit').order('name'),
      supabase.from('ops_jobs').select('*').order('created_at', { ascending:false }).limit(250),
      supabase.from('ops_vending_visits').select('*').order('created_at', { ascending:false }).limit(250),
      supabase.from('ops_calendar_events').select('*').order('starts_at', { ascending:true }).limit(250),
      supabase.from('ops_maintenance').select('*').order('reported_at', { ascending:false }).limit(250)
    ])
    setSnapshot({
      balances:results[0].data || [],
      transactions:results[1].data || [],
      products:results[2].data || [],
      jobs:results[3].data || [],
      visits:results[4].data || [],
      events:results[5].data || [],
      maintenance:results[6].data || []
    })
  }

  useEffect(() => {
    const onHash = () => setPage(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!isHome) {
      setTarget(null)
      return
    }

    let cleanup = () => {}
    const setup = () => {
      const main = document.querySelector('.main')
      const topbar = main?.querySelector(':scope > .topbar')
      if (!main || !topbar) return false

      let mount = main.querySelector(':scope > #simple-dashboard-root')
      if (!mount) {
        mount = document.createElement('div')
        mount.id = 'simple-dashboard-root'
        topbar.insertAdjacentElement('afterend', mount)
      }

      const hidden = [...main.children].filter(el => el !== topbar && el !== mount)
      hidden.forEach(el => {
        el.dataset.simpleDashboardOldDisplay = el.style.display || ''
        el.style.display = 'none'
      })
      setTarget(mount)

      cleanup = () => {
        hidden.forEach(el => {
          el.style.display = el.dataset.simpleDashboardOldDisplay || ''
          delete el.dataset.simpleDashboardOldDisplay
        })
        if (mount?.parentNode) mount.parentNode.removeChild(mount)
      }
      return true
    }

    if (!setup()) {
      const timer = setInterval(() => {
        if (setup()) clearInterval(timer)
      }, 250)
      cleanup = () => clearInterval(timer)
    }

    load()
    const refreshTimer = setInterval(load, 15000)
    const onBalance = () => load()
    addEventListener('swiftsupply-balance-changed', onBalance)

    return () => {
      clearInterval(refreshTimer)
      removeEventListener('swiftsupply-balance-changed', onBalance)
      cleanup()
      setTarget(null)
    }
  }, [isHome])

  const view = useMemo(() => {
    const cleared = snapshot.transactions.filter(t => t.status === 'Cleared' && OPERATING_AREAS.has(t.business_area))
    const sales = cleared.filter(t => t.direction === 'In').reduce((s,t) => s + Number(t.amount || 0), 0)
    const expenses = cleared.filter(t => t.direction === 'Out').reduce((s,t) => s + Number(t.amount || 0), 0)
    const profit = sales - expenses
    const totalMoney = snapshot.balances.reduce((s,b) => s + Number(b.balance || 0), 0)
    const pending = snapshot.transactions
      .filter(t => t.status === 'Pending' && t.direction === 'In' && OPERATING_AREAS.has(t.business_area))
      .reduce((s,t) => s + Number(t.amount || 0), 0)
    const low = snapshot.products.filter(p => p.active !== false && Number(p.current_stock) <= Number(p.reorder_level || 0))
    const openIssues = snapshot.maintenance.filter(m => !['fixed','completed'].includes(String(m.status || '').toLowerCase()))
    const psssStock = snapshot.products.filter(p => p.business_unit === 'PSSS').reduce((s,p) => s + Number(p.current_stock || 0), 0)
    const areaSales = area => cleared.filter(t => t.direction === 'In' && t.business_area === area).reduce((s,t) => s + Number(t.amount || 0), 0)
    const completedJobs = snapshot.jobs.filter(j => String(j.status).toLowerCase() === 'completed').length
    const upcoming = [
      ...snapshot.jobs.filter(j => j.scheduled_start && !['completed','cancelled'].includes(String(j.status).toLowerCase())).map(j => ({ id:`j-${j.id}`, when:j.scheduled_start, title:j.title || j.job_code || 'SSPW job', type:'SSPW', status:j.status })),
      ...snapshot.visits.filter(v => v.scheduled_for && !['completed','cancelled'].includes(String(v.status).toLowerCase())).map(v => ({ id:`v-${v.id}`, when:v.scheduled_for, title:v.visit_code || 'Vending visit', type:'Vending', status:v.status })),
      ...snapshot.events.filter(e => e.starts_at && !['completed','cancelled'].includes(String(e.status).toLowerCase())).map(e => ({ id:`e-${e.id}`, when:e.starts_at, title:e.title || 'Event', type:e.business_area || 'Event', status:e.status }))
    ].sort((a,b) => new Date(a.when) - new Date(b.when)).slice(0,4)
    const balances = [...snapshot.balances].sort((a,b) => {
      const ai = accountOrder.indexOf(a.account), bi = accountOrder.indexOf(b.account)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.account.localeCompare(b.account)
    })
    return { sales, expenses, profit, totalMoney, pending, low, openIssues, psssStock, areaSales, completedJobs, upcoming, balances }
  }, [snapshot])

  if (!target || !isHome) return null

  return createPortal(
    <div>
      <div className="card" style={{ marginBottom:16, padding:'18px 20px' }}>
        <div className="small muted" style={{ fontWeight:800, letterSpacing:'.06em', marginBottom:6 }}>AT A GLANCE</div>
        <div style={{ fontSize:18, lineHeight:1.45 }}>
          You have <strong>{money(view.totalMoney)}</strong> tracked right now. SwiftSupply has recorded <strong>{money(view.sales)}</strong> in sales and <strong>{money(view.expenses)}</strong> in business expenses, so the current operating result is <strong>{money(view.profit)}</strong>.
        </div>
        <div className="small muted" style={{ marginTop:8 }}>Money on hand and profit are different numbers. Investor funds are included in tracked money, but not in sales.</div>
      </div>

      <div className="grid metrics" style={{ marginBottom:16 }}>
        <div className="metric"><div className="label">Money on hand</div><div className="value">{money(view.totalMoney)}</div><div className="sub">All tracked accounts</div></div>
        <div className="metric"><div className="label">Sales</div><div className="value">{money(view.sales)}</div><div className="sub">Vending + SSPW + PSSS</div></div>
        <div className="metric"><div className="label">Business expenses</div><div className="value">{money(view.expenses)}</div><div className="sub">Recorded operating spending</div></div>
        <div className="metric"><div className="label">Profit / loss</div><div className="value">{money(view.profit)}</div><div className="sub">Sales − business expenses</div></div>
      </div>

      <div className="grid twocol" style={{ marginBottom:16 }}>
        <div className="card">
          <div className="sectionhead"><div><h2>Where your money is</h2><div className="small muted">These balances add up to Money on hand.</div></div></div>
          <div className="list">
            {view.balances.length ? view.balances.map(row => <div className="rowcard" key={row.account}>
              <div><div className="title">{row.account}</div><div className="meta">{accountNote(row.account)}</div></div>
              <strong>{money(row.balance)}</strong>
            </div>) : <div className="empty">No account balances yet.</div>}
          </div>
        </div>

        <div className="card">
          <div className="sectionhead"><div><h2>Needs attention</h2><div className="small muted">Only the stuff you may need to act on.</div></div></div>
          <div className="list">
            <div className="rowcard"><div><div className="title">Money customers owe</div><div className="meta">Not cash until collected</div></div><strong>{money(view.pending)}</strong></div>
            <div className="rowcard"><div><div className="title">Low-stock products</div><div className="meta">At or below reorder level</div></div><strong>{view.low.length}</strong></div>
            <div className="rowcard"><div><div className="title">Open equipment issues</div><div className="meta">Maintenance not marked fixed</div></div><strong>{view.openIssues.length}</strong></div>
          </div>
        </div>
      </div>

      <div className="grid twocol">
        <div className="card">
          <div className="sectionhead"><div><h2>Business lines</h2><div className="small muted">Quick view — details stay in Work.</div></div></div>
          <div className="list">
            <div className="rowcard"><div><div className="title">PSSS</div><div className="meta">{view.psssStock} units in stock</div></div><strong>{money(view.areaSales('Personal Selling'))}</strong></div>
            <div className="rowcard"><div><div className="title">SSPW</div><div className="meta">{view.completedJobs} completed job{view.completedJobs === 1 ? '' : 's'}</div></div><strong>{money(view.areaSales('SSPW'))}</strong></div>
            <div className="rowcard"><div><div className="title">Vending</div><div className="meta">Sales recorded so far</div></div><strong>{money(view.areaSales('SS Vending'))}</strong></div>
          </div>
        </div>

        <div className="card">
          <div className="sectionhead"><div><h2>Next up</h2><div className="small muted">Next scheduled jobs, visits, or events.</div></div></div>
          <div className="list">
            {view.upcoming.length ? view.upcoming.map(item => <div className="rowcard" key={item.id}>
              <div><div className="title">{item.title}</div><div className="meta">{item.type} • {shortWhen(item.when)}</div></div>
              <span className={`pill ${String(item.status || '').toLowerCase().replaceAll(' ','_')}`}>{item.status || 'scheduled'}</span>
            </div>) : <div className="empty">Nothing scheduled next.</div>}
          </div>
        </div>
      </div>

      <div className="small muted" style={{ textAlign:'center', margin:'14px 0 4px' }}>Use Money, Work, Inventory, and the other tabs only when you need the details.</div>
    </div>,
    target
  )
}
