import React, { useEffect, useMemo, useState } from 'react'
import {
  Home, CalendarDays, BriefcaseBusiness, Users, MoreHorizontal, Store, WalletCards,
  Settings, LogOut, RefreshCw, X, Droplets, Package, ShoppingCart, UserCog,
  Boxes, History, PlusCircle, Wrench, CheckCircle2, AlertTriangle
} from 'lucide-react'
import { supabase } from './lib/supabase'
import * as api from './lib/api'
import SaleForm from './SaleForm'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))
const dt = v => v ? new Date(v).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const toIso = v => v ? new Date(v).toISOString() : null
const pageFromHash = () => (location.hash.replace('#/', '') || 'home').split('?')[0]
const positionOptions = [
  'Founder / Owner / President','General Manager','Operations Manager','Finance / Bookkeeping Manager',
  'Sales Manager','Marketing / Social Media Manager','Customer Service Representative','SSPW Manager',
  'SSPW Crew Lead','SSPW Technician','Vending Operations Manager','Vending Route Operator',
  'Vending Maintenance Technician','Inventory / Purchasing Coordinator','PSSS Sales Representative',
  'Business Development Representative','HR / Staff Coordinator','Intern'
]
const roleLabel = role => ({ owner:'Owner', manager:'Manager', employee:'Employee', intern:'Intern', pending:'Pending' }[role] || role)
const emptyData = {
  profiles:[], customers:[], jobs:[], assignments:[], subscriptions:[], locations:[], machines:[], visits:[],
  restockItems:[], products:[], sales:[], saleItems:[], transactions:[], maintenance:[], calendarEvents:[],
  inventoryMovements:[], auditLog:[], syncQueue:[]
}

const nav = [
  ['home','Dashboard',Home],['schedule','Schedule',CalendarDays],['work','Work',BriefcaseBusiness],
  ['customers','Customers',Users],['vending','Vending',Store],['inventory','Inventory',Boxes],
  ['employees','Employees',UserCog],['money','Money',WalletCards],['settings','Settings',Settings]
]
const mobileNav = [['home','Home',Home],['schedule','Schedule',CalendarDays],['work','Work',BriefcaseBusiness],['customers','Customers',Users],['more','More',MoreHorizontal]]

function Pill({ children, status='' }) {
  return <span className={`pill ${String(status).toLowerCase().replaceAll(' ','_')}`}>{children}</span>
}
function Field({ label, children, span=false }) { return <div className={`field ${span ? 'span2' : ''}`}><label>{label}</label>{children}</div> }
function Modal({ title, onClose, children }) {
  return <div className="modalback" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modalhead"><h2>{title}</h2><button className="iconbtn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>
}
function Header({ title, subtitle, actions }) { return <div className="topbar"><div><h1>{title}</h1>{subtitle && <div className="muted small">{subtitle}</div>}</div><div className="actions">{actions}</div></div> }
function Metric({ label, value, sub }) { return <div className="metric"><div className="label">{label}</div><div className="value">{value}</div>{sub && <div className="sub">{sub}</div>}</div> }
function Empty({ text='Nothing logged yet.' }) { return <div className="empty">{text}</div> }
function FormButtons({ busy, onClose }) { return <div className="actions" style={{ marginTop:16, justifyContent:'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div> }

function Login({ onReady }) {
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const login = async e => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message); else await onReady()
    setBusy(false)
  }
  const signup = async () => {
    if (!email || !password) return setError('Enter an email and password first.')
    setBusy(true); setError(''); setMessage('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else setMessage('Staff access requested. Confirm your email if asked, then wait for Owner approval.')
    setBusy(false)
  }
  const reset = async () => {
    setBusy(true); setError(''); setMessage('')
    try { await api.requestPasswordReset(email); setMessage('Password reset email sent. Use the link in your email to choose a new password.') }
    catch (e) { setError(e.message) }
    setBusy(false)
  }
  return <div className="loginpage"><div className="loginbox"><div className="brandmark">SS</div><h1>SwiftSupply Ops</h1><div className="muted">Vending • SSPW • PSSS</div><form onSubmit={login}>
    <Field label="Email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></Field>
    <Field label="Password"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></Field>
    {error && <div className="notice error">{error}</div>}{message && <div className="notice">{message}</div>}
    <button className="btn primary" disabled={busy}>{busy ? 'Working…' : 'Sign in'}</button>
    <button type="button" className="btn" onClick={signup} disabled={busy}>Request staff access</button>
    <button type="button" className="btn" onClick={reset} disabled={busy}>Forgot password</button>
  </form><p className="small muted">Only approved SwiftSupply staff can access business data.</p></div></div>
}

function ChangePassword({ onDone }) {
  const [password,setPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const submit=async e=>{
    e.preventDefault(); setError('')
    if(password!==confirmPassword) return setError('Passwords do not match.')
    setBusy(true)
    try { await api.updatePassword(password); onDone() } catch(e) { setError(e.message) }
    setBusy(false)
  }
  return <div className="loginpage"><div className="loginbox"><div className="brandmark">SS</div><h1>Set new password</h1><p className="muted">Choose a new SwiftSupply Ops password.</p><form onSubmit={submit}>
    <Field label="New password"><input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></Field>
    <Field label="Confirm password"><input type="password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></Field>
    {error&&<div className="notice error">{error}</div>}
    <button className="btn primary" disabled={busy}>{busy?'Saving…':'Save password'}</button>
  </form></div></div>
}

function Shell({ profile, page, setPage, children }) {
  const go = p => { location.hash=`#/${p}`; setPage(p) }
  return <div className="app"><aside className="sidebar"><div className="brand"><div className="brandmark">SS</div><div>SwiftSupply Ops</div></div><div className="nav">
    {nav.map(([id,label,I])=><button key={id} className={`navbtn ${page===id?'active':''}`} onClick={()=>go(id)}><I size={18}/>{label}</button>)}
  </div><div className="sidebarfoot"><div>{profile?.full_name||'SwiftSupply User'}</div><div>{profile?.job_title||roleLabel(profile?.role||'employee')} • {roleLabel(profile?.role||'employee')}</div></div></aside>
  <main className="main">{children}</main><nav className="bottomnav">{mobileNav.map(([id,label,I])=><button key={id} className={page===id?'active':''} onClick={()=>go(id)}><I size={20}/><span>{label}</span></button>)}</nav></div>
}

function Dashboard({ data, refresh, open }) {
  const cleared=data.transactions.filter(t=>t.status==='Cleared')
  const sum=(area,direction)=>cleared.filter(t=>t.business_area===area&&t.direction===direction).reduce((s,t)=>s+Number(t.amount),0)
  const psssStock=data.products.filter(p=>p.business_unit==='PSSS').reduce((s,p)=>s+Number(p.current_stock),0)
  const low=data.products.filter(p=>p.active!==false && Number(p.current_stock)<=Number(p.reorder_level||0))
  const completed=data.jobs.filter(j=>j.status==='completed')
  const upcoming=[
    ...data.jobs.filter(j=>j.scheduled_start&&!['completed','cancelled'].includes(j.status)).map(j=>({...j,when:j.scheduled_start,kind:'SSPW'})),
    ...data.visits.filter(v=>v.scheduled_for&&!['completed','cancelled'].includes(v.status)).map(v=>({...v,when:v.scheduled_for,kind:'Vending'})),
    ...data.calendarEvents.filter(e=>e.starts_at&&!['completed','cancelled'].includes(e.status)).map(e=>({...e,when:e.starts_at,kind:e.business_area||'Event'}))
  ].sort((a,b)=>new Date(a.when)-new Date(b.when)).slice(0,8)
  const pendingMoney=data.transactions.filter(t=>t.status==='Pending'&&t.direction==='In').reduce((s,t)=>s+Number(t.amount),0)
  const netAll=cleared.reduce((s,t)=>s+(t.direction==='In'?Number(t.amount):-Number(t.amount)),0)
  return <><Header title="SwiftSupply Dashboard" subtitle="Live operations across Vending, SSPW and PSSS" actions={<><button className="btn" onClick={refresh}><RefreshCw size={15}/> Refresh</button><button className="btn primary" onClick={()=>open('quick')}>+ Log activity</button></>}/>
    <div className="grid metrics"><Metric label="Company net movement" value={money(netAll)} sub="Cleared transactions"/><Metric label="SSPW revenue" value={money(sum('SSPW','In'))} sub={`${completed.length} completed jobs`}/><Metric label="Vending revenue" value={money(sum('SS Vending','In'))} sub={`Expenses ${money(sum('SS Vending','Out'))}`}/><Metric label="PSSS collected" value={money(sum('Personal Selling','In'))} sub={`${psssStock} units in stock`}/></div>
    <div className="grid twocol"><div className="card"><div className="sectionhead"><h2>Next up</h2><span className="small muted">Jobs, visits & events</span></div><div className="list">{upcoming.length?upcoming.map(x=><div className="rowcard" key={`${x.kind}-${x.id}`}><div><div className="title">{x.title||x.job_code||x.visit_code||'Scheduled work'}</div><div className="meta">{x.kind} • {dt(x.when)}</div></div><Pill status={x.status}>{x.status}</Pill></div>):<Empty text="Nothing upcoming."/>}</div></div>
    <div className="card"><h2>Needs attention</h2><div className="list"><div className="rowcard"><div><div className="title">Pending / owed money</div><div className="meta">Not counted as available cash</div></div><strong>{money(pendingMoney)}</strong></div><div className="rowcard"><div><div className="title">Low-stock products</div><div className="meta">At or below reorder level</div></div><strong>{low.length}</strong></div><div className="rowcard"><div><div className="title">Open machine issues</div><div className="meta">Maintenance not marked fixed</div></div><strong>{data.maintenance.filter(m=>!['Fixed','fixed','completed'].includes(m.status)).length}</strong></div></div></div></div>
    <div className="card" style={{marginTop:16}}><h2>Quick actions</h2><div className="quickgrid"><button className="quick" onClick={()=>open('job')}><Droplets/><strong>New SSPW job</strong><span className="small muted">Quote or schedule</span></button><button className="quick" onClick={()=>open('visit')}><Store/><strong>Vending visit</strong><span className="small muted">Schedule route work</span></button><button className="quick" onClick={()=>open('sale')}><ShoppingCart/><strong>PSSS sale</strong><span className="small muted">Record a sale</span></button><button className="quick" onClick={()=>open('transaction')}><WalletCards/><strong>Money entry</strong><span className="small muted">Income or expense</span></button></div></div>
  </>
}

function Schedule({ data, open }) {
  const items=useMemo(()=>[
    ...data.jobs.filter(j=>j.scheduled_start).map(j=>({id:`job-${j.id}`,when:j.scheduled_start,title:j.title||j.job_code,type:'SSPW',status:j.status,where:j.address})),
    ...data.visits.filter(v=>v.scheduled_for).map(v=>({id:`visit-${v.id}`,when:v.scheduled_for,title:data.machines.find(m=>m.id===v.machine_id)?.label||v.visit_code,type:'Vending',status:v.status,where:data.locations.find(l=>l.id===data.machines.find(m=>m.id===v.machine_id)?.location_id)?.address})),
    ...data.calendarEvents.map(e=>({id:`event-${e.id}`,when:e.starts_at,title:e.title,type:e.business_area||e.event_type,status:e.status,where:e.location}))
  ].sort((a,b)=>new Date(a.when)-new Date(b.when)),[data])
  return <><Header title="Schedule" subtitle="SSPW appointments, vending visits and internal events" actions={<><button className="btn" onClick={()=>open('visit')}>+ Vending visit</button><button className="btn primary" onClick={()=>open('event')}>+ Event</button></>}/><div className="card"><div className="list">{items.length?items.map(x=><div className="rowcard" key={x.id}><div><div className="title">{x.type} • {x.title}</div><div className="meta">{dt(x.when)}{x.where?` • ${x.where}`:''}</div></div><Pill status={x.status}>{x.status}</Pill></div>):<Empty text="Nothing scheduled yet."/>}</div></div></>
}

function Work({ data, open }) {
  const [tab,setTab]=useState('sspw')
  return <><Header title="Work" subtitle="Operate all three SwiftSupply business lines" actions={<button className="btn primary" onClick={()=>open(tab==='sspw'?'job':tab==='vending'?'visit':'sale')}>+ New</button>}/><div className="tabs" style={{marginBottom:14}}>{[['sspw','SSPW'],['vending','Vending'],['psss','PSSS'],['subs','Subscriptions']].map(([id,l])=><button key={id} className={`tab ${tab===id?'active':''}`} onClick={()=>setTab(id)}>{l}</button>)}</div>
    {tab==='sspw'&&<div className="card"><div className="sectionhead"><h2>Pressure washing jobs</h2><button className="btn sm" onClick={()=>open('job')}>+ Job</button></div><div className="list">{data.jobs.filter(j=>j.business_unit==='SSPW').length?data.jobs.filter(j=>j.business_unit==='SSPW').map(j=>{const c=data.customers.find(x=>x.id===j.customer_id);const assigned=data.assignments.filter(a=>a.job_id===j.id).map(a=>data.profiles.find(p=>p.id===a.employee_id)?.full_name).filter(Boolean).join(', ');return <div className="rowcard" key={j.id}><div><div className="title">{j.job_code} • {j.title}</div><div className="meta">{c?.name||'No customer'} • {dt(j.scheduled_start)} • Est. {money(j.estimated_value)}{assigned?` • ${assigned}`:''}</div></div><div className="right"><Pill status={j.status}>{j.status}</Pill>{!['completed','cancelled'].includes(j.status)&&<button className="btn sm good" style={{marginTop:6}} onClick={()=>open('completeJob',j)}>Complete</button>}</div></div>}):<Empty/>}</div></div>}
    {tab==='vending'&&<div className="card"><div className="sectionhead"><h2>Vending service visits</h2><button className="btn sm" onClick={()=>open('restockItem')}>Log restock item</button></div><div className="list">{data.visits.length?data.visits.map(v=>{const m=data.machines.find(x=>x.id===v.machine_id);return <div className="rowcard" key={v.id}><div><div className="title">{v.visit_code} • {m?.label||'Machine'}</div><div className="meta">{dt(v.scheduled_for)} • Cash {money(v.cash_collected)} • Card {money(v.card_sales)}</div></div><div className="right"><Pill status={v.status}>{v.status}</Pill>{!['completed','cancelled'].includes(v.status)&&<button className="btn sm good" style={{marginTop:6}} onClick={()=>open('completeVisit',v)}>Complete</button>}</div></div>}):<Empty/>}</div></div>}
    {tab==='psss'&&<div className="grid twocol"><div className="card"><div className="sectionhead"><h2>PSSS stock</h2><button className="btn sm primary" onClick={()=>open('sale')}>Quick sale</button></div><div className="list">{data.products.filter(p=>p.business_unit==='PSSS').map(p=><div className="rowcard" key={p.id}><div><div className="title">{p.name}</div><div className="meta">{money(p.sell_price)}{p.promo_qty?` • ${p.promo_qty} for ${money(p.promo_price)}`:''}</div></div><strong>{p.current_stock}</strong></div>)}</div></div><div className="card"><h2>Recent sales</h2><div className="list">{data.sales.slice(0,10).map(s=><div className="rowcard" key={s.id}><div><div className="title">{s.sale_code}</div><div className="meta">{dt(s.sold_at)} • {s.buyer_place||'Direct sale'}</div></div><div className="right"><div>{money(s.total_amount)}</div><Pill status={s.payment_status}>{s.payment_status}</Pill></div></div>)}</div></div></div>}
    {tab==='subs'&&<div className="card"><div className="sectionhead"><h2>SSPW recurring service</h2><button className="btn sm primary" onClick={()=>open('subscription')}>+ Subscriber</button></div><div className="list">{data.subscriptions.length?data.subscriptions.map(s=>{const c=data.customers.find(x=>x.id===s.customer_id);return <div className="rowcard" key={s.id}><div><div className="title">{c?.name||'Customer'} • {s.plan_name}</div><div className="meta">Next {s.next_service||'not set'} • every {s.cadence_days} days</div></div><div className="right"><div>{money(s.monthly_price)}/mo</div><Pill status={s.status}>{s.status}</Pill></div></div>}):<Empty text="No recurring customers yet."/>}</div></div>}
  </>
}

function Customers({ data, open }) {
  return <><Header title="Customers" subtitle="Customer records and SSPW history" actions={<button className="btn primary" onClick={()=>open('customer')}>+ Customer</button>}/><div className="card"><div className="list">{data.customers.length?data.customers.map(c=>{const jobs=data.jobs.filter(j=>j.customer_id===c.id);const revenue=jobs.reduce((s,j)=>s+Number(j.actual_revenue||0),0);return <div className="rowcard" key={c.id}><div><div className="title">{c.name}</div><div className="meta">{c.phone||c.email||'No contact'} • {c.address||c.city||'No address'} • {jobs.length} jobs</div></div><div className="right"><strong>{money(revenue)}</strong><Pill status={c.customer_type}>{c.customer_type}</Pill></div></div>}):<Empty/>}</div></div></>
}

function Vending({ data, open }) {
  const recentRestocks=data.restockItems.slice(0,12)
  return <><Header title="SS Vending" subtitle="Locations, machines, route service, inventory and maintenance" actions={<><button className="btn" onClick={()=>open('visit')}>+ Visit</button><button className="btn primary" onClick={()=>open('location')}>+ Location</button></>}/>
    <div className="grid threecol"><div className="card"><div className="sectionhead"><h3>Locations</h3><button className="btn sm" onClick={()=>open('location')}>Add</button></div><div className="list">{data.locations.length?data.locations.map(l=><div className="rowcard" key={l.id}><div><div className="title">{l.name}</div><div className="meta">{l.city||l.address||''} • {Number(l.commission_pct||0)*100}% commission</div></div><Pill status={l.agreement_signed?'active':'pending'}>{l.agreement_signed?'signed':'unsigned'}</Pill></div>):<Empty/>}</div></div>
    <div className="card"><div className="sectionhead"><h3>Machines</h3><button className="btn sm" onClick={()=>open('machine')}>Add</button></div><div className="list">{data.machines.length?data.machines.map(m=><div className="rowcard" key={m.id}><div><div className="title">{m.label}</div><div className="meta">{m.machine_code} • {m.make_model||m.machine_type} • {m.card_reader|| (m.nayax_enabled?'Nayax':'No reader listed')}</div></div><Pill status={m.status}>{m.status}</Pill></div>):<Empty/>}</div></div>
    <div className="card"><div className="sectionhead"><h3>Maintenance</h3><button className="btn sm" onClick={()=>open('maintenance')}>Report</button></div><div className="list">{data.maintenance.slice(0,8).length?data.maintenance.slice(0,8).map(r=><div className="rowcard" key={r.id}><div><div className="title">{r.problem}</div><div className="meta">{data.machines.find(m=>m.id===r.machine_id)?.label||'Machine'}</div></div><Pill status={r.status}>{r.status}</Pill></div>):<Empty/>}</div></div></div>
    <div className="grid twocol" style={{marginTop:16}}><div className="card"><div className="sectionhead"><h2>Recent restocks</h2><button className="btn sm primary" onClick={()=>open('restockItem')}>+ Restock item</button></div><div className="list">{recentRestocks.length?recentRestocks.map(r=>{const visit=data.visits.find(v=>v.id===r.visit_id);const machine=data.machines.find(m=>m.id===visit?.machine_id);const product=data.products.find(p=>p.id===r.product_id);return <div className="rowcard" key={r.id}><div><div className="title">{machine?.label||'Machine'} • {product?.name||'Product'}</div><div className="meta">Added {r.quantity_added} • machine stock {r.inventory_after} • {dt(r.created_at)}</div></div><strong>{money(r.restock_cost)}</strong></div>}):<Empty text="No restock items logged yet."/>}</div></div>
    <div className="card"><h2>Route performance</h2><div className="list">{data.machines.map(m=>{const vs=data.visits.filter(v=>v.machine_id===m.id&&v.status==='completed');const revenue=vs.reduce((s,v)=>s+Number(v.cash_collected||0)+Number(v.card_sales||0),0);const costs=vs.reduce((s,v)=>s+Number(v.restock_cost||0)+Number(v.location_fee||0)+Number(v.card_fees||0)+Number(v.other_cost||0),0);return <div className="rowcard" key={m.id}><div><div className="title">{m.label}</div><div className="meta">{vs.length} completed visits</div></div><strong>{money(revenue-costs)} net</strong></div>})}</div></div></div>
  </>
}

function Inventory({ data, profile, open }) {
  const canAdjust=['owner','manager'].includes(profile.role)
  const low=data.products.filter(p=>p.active!==false&&Number(p.current_stock)<=Number(p.reorder_level||0))
  return <><Header title="Inventory" subtitle="Central stock for Vending and PSSS with movement history" actions={<><button className="btn" onClick={()=>open('productAny')}>+ Product</button>{canAdjust&&<button className="btn primary" onClick={()=>open('inventoryAdjust')}>Adjust stock</button>}</>}/>
    {low.length>0&&<div className="notice" style={{marginBottom:14}}><AlertTriangle size={16}/> {low.length} product{low.length===1?' is':'s are'} at or below reorder level.</div>}
    <div className="card"><div className="tablewrap"><table><thead><tr><th>Division</th><th>Product</th><th>Cost</th><th>Sell</th><th>Stock</th><th>Reorder</th><th>Status</th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td>{p.business_unit==='SS'?'Vending':p.business_unit}</td><td>{p.name}</td><td>{money(p.unit_cost)}</td><td>{money(p.sell_price)}</td><td>{p.current_stock}</td><td>{p.reorder_level}</td><td>{Number(p.current_stock)<=Number(p.reorder_level||0)?<Pill status="pending">reorder</Pill>:<Pill status="active">ok</Pill>}</td></tr>)}</tbody></table></div></div>
    <div className="card" style={{marginTop:16}}><div className="sectionhead"><h2>Stock movement history</h2><History size={19}/></div><div className="tablewrap"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>Before</th><th>After</th><th>Notes</th></tr></thead><tbody>{data.inventoryMovements.slice(0,100).map(m=>{const p=data.products.find(x=>x.id===m.product_id);return <tr key={m.id}><td>{dt(m.created_at)}</td><td>{p?.name||m.product_id}</td><td>{m.movement_type}</td><td className={Number(m.quantity_delta)>0?'moneypos':'moneyneg'}>{Number(m.quantity_delta)>0?'+':''}{m.quantity_delta}</td><td>{m.stock_before}</td><td>{m.stock_after}</td><td>{m.notes||m.source_type||''}</td></tr>)}</tbody></table></div></div>
  </>
}

function Employees({ data, profile, refresh }) {
  const isOwner=profile.role==='owner'
  const [busy,setBusy]=useState(null)
  const pending=data.profiles.filter(p=>!p.active&&p.role==='pending'&&p.access_requested_at)
  const active=data.profiles.filter(p=>p.active)
  const approve=async(p,role,jobTitle)=>{setBusy(p.id);const {error}=await supabase.rpc('ops_approve_staff',{p_user_id:p.id,p_role:role,p_job_title:jobTitle});if(error)alert(error.message);await refresh();setBusy(null)}
  const deny=async p=>{if(!confirm(`Deny access for ${p.full_name||'this account'}?`))return;setBusy(p.id);const {error}=await supabase.rpc('ops_deny_staff_request',{p_user_id:p.id});if(error)alert(error.message);await refresh();setBusy(null)}
  const roleChange=async(p,role)=>{setBusy(p.id);try{await api.setRole(p.id,role);await refresh()}catch(e){alert(e.message)}setBusy(null)}
  const positionChange=async(p,title)=>{setBusy(p.id);const {error}=await supabase.rpc('ops_set_job_title',{p_user_id:p.id,p_job_title:title});if(error)alert(error.message);await refresh();setBusy(null)}
  const fire=async p=>{if(!confirm(`Deactivate ${p.full_name||'this staff member'}? Their work history will be kept.`))return;setBusy(p.id);try{await api.deactivateStaff(p.id);await refresh()}catch(e){alert(e.message)}setBusy(null)}
  return <><Header title="Employees" subtitle="Access level and job position are separate"/>
    {isOwner&&<div className="card" style={{marginBottom:16}}><div className="sectionhead"><h2>Pending access requests</h2><Pill status={pending.length?'pending':'active'}>{pending.length}</Pill></div><div className="list">{pending.length?pending.map(p=><PendingStaff key={p.id} person={p} busy={busy===p.id} onApprove={approve} onDeny={deny}/>):<Empty text="No pending staff requests."/>}</div></div>}
    <div className="card"><div className="sectionhead"><h2>Team</h2><span className="small muted">{active.length} active</span></div><div className="list">{active.map(p=><div className="rowcard" key={p.id}><div><div className="title">{p.full_name||'Staff user'}</div><div className="meta">{p.job_title||'No position assigned'} • {roleLabel(p.role)}</div></div>{isOwner&&p.id!==profile.id?<div className="actions" style={{flexWrap:'wrap'}}><select value={p.role} disabled={busy===p.id} onChange={e=>roleChange(p,e.target.value)}><option value="manager">Manager</option><option value="employee">Employee</option><option value="intern">Intern</option>{p.role==='owner'&&<option value="owner">Owner</option>}</select><select value={p.job_title||''} disabled={busy===p.id} onChange={e=>positionChange(p,e.target.value)}><option value="">Choose position</option>{positionOptions.filter(x=>x!=='Founder / Owner / President').map(x=><option key={x}>{x}</option>)}</select>{p.role!=='owner'&&<button className="btn sm danger" disabled={busy===p.id} onClick={()=>fire(p)}>Deactivate</button>}</div>:<Pill status={p.role}>{roleLabel(p.role)}</Pill>}</div>)}</div></div>
  </>
}
function PendingStaff({person,busy,onApprove,onDeny}){
  const [role,setRole]=useState('intern'),[title,setTitle]=useState('Intern')
  return <div className="rowcard"><div><div className="title">{person.full_name||'Staff applicant'}</div><div className="meta">Pending • no business access</div></div><div className="actions" style={{flexWrap:'wrap'}}><select value={role} onChange={e=>setRole(e.target.value)} disabled={busy}><option value="intern">Intern</option><option value="employee">Employee</option><option value="manager">Manager</option></select><select value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}>{positionOptions.filter(x=>x!=='Founder / Owner / President').map(x=><option key={x}>{x}</option>)}</select><button className="btn sm good" disabled={busy} onClick={()=>onApprove(person,role,title)}>Approve</button><button className="btn sm danger" disabled={busy} onClick={()=>onDeny(person)}>Deny</button></div></div>
}

function Money({ data, open }) {
  const cleared=data.transactions.filter(t=>t.status==='Cleared')
  const totalIn=cleared.filter(t=>t.direction==='In').reduce((s,t)=>s+Number(t.amount),0)
  const totalOut=cleared.filter(t=>t.direction==='Out').reduce((s,t)=>s+Number(t.amount),0)
  const pending=data.transactions.filter(t=>t.status==='Pending'&&t.direction==='In').reduce((s,t)=>s+Number(t.amount),0)
  return <><Header title="Money" subtitle="Central operational ledger; Sheets is a mirror, not the database" actions={<button className="btn primary" onClick={()=>open('transaction')}>+ Transaction</button>}/><div className="grid metrics"><Metric label="Cleared in" value={money(totalIn)}/><Metric label="Cleared out" value={money(totalOut)}/><Metric label="Net" value={money(totalIn-totalOut)}/><Metric label="Pending / owed" value={money(pending)}/></div><div className="card"><div className="tablewrap"><table><thead><tr><th>Date</th><th>Area</th><th>Account</th><th>Direction</th><th>Status</th><th>Category</th><th>Amount</th></tr></thead><tbody>{data.transactions.map(t=><tr key={t.id}><td>{dt(t.occurred_at)}</td><td>{t.business_area}</td><td>{t.account}</td><td>{t.direction}</td><td>{t.status}</td><td>{t.source_category}</td><td className={t.direction==='In'?'moneypos':'moneyneg'}>{t.direction==='In'?'+':'-'}{money(t.amount)}</td></tr>)}</tbody></table></div></div></>
}

function SettingsPage({ data, profile, refresh }) {
  const pending=data.syncQueue.filter(x=>x.status!=='synced').length
  const sync=async()=>{await api.triggerSync();setTimeout(refresh,700)}
  const auditAllowed=['owner','manager'].includes(profile.role)
  return <><Header title="Settings" subtitle="Account, PWA, Google Sheets export and audit trail"/><div className="grid twocol"><div className="card"><h2>Google Sheets mirror</h2><p className="muted">Supabase is the source of truth. Existing records still queue to the SwiftSupply Business Manager sheet for reporting/export.</p><div className="rowcard"><div><div className="title">Sync queue</div><div className="meta">{pending} waiting / failed items</div></div><button className="btn primary" onClick={sync}><RefreshCw size={15}/> Sync now</button></div><a className="btn" style={{display:'inline-block',marginTop:12,textDecoration:'none'}} target="_blank" rel="noreferrer" href="https://docs.google.com/spreadsheets/d/1niD9R4QDFXxYc6BTbk_MMJGfmcIIsBd_w0x3C6Zwivc/edit">Open business spreadsheet</a></div><div className="card"><h2>Phone / PWA</h2><p className="muted">Install SwiftSupply Ops from Safari or Chrome for field use. The existing service worker and manifest remain enabled.</p><div className="rowcard"><div><div className="title">Signed in as</div><div className="meta">{profile.full_name||'SwiftSupply user'} • {roleLabel(profile.role)}</div></div><Pill status="active">active</Pill></div><button className="btn danger" style={{marginTop:12}} onClick={()=>api.signOut()}><LogOut size={15}/> Sign out</button></div></div>
    {auditAllowed&&<div className="card" style={{marginTop:16}}><div className="sectionhead"><h2>Audit log</h2><History size={19}/></div><p className="small muted">Database-recorded changes to operational records. This is not a browser-only activity list.</p><div className="tablewrap"><table><thead><tr><th>When</th><th>Table</th><th>Action</th><th>Actor</th><th>Record</th></tr></thead><tbody>{data.auditLog.map(a=><tr key={a.id}><td>{dt(a.created_at)}</td><td>{a.table_name}</td><td>{a.action}</td><td>{data.profiles.find(p=>p.id===a.actor_id)?.full_name||'System'}</td><td>{a.record_id||'—'}</td></tr>)}</tbody></table></div></div>}
  </>
}
function More({setPage}) { const go=id=>{location.hash=`#/${id}`;setPage(id)}; return <><Header title="More" subtitle="Business tools and administration"/><div className="quickgrid">{[['vending','Vending',Store],['inventory','Inventory',Boxes],['employees','Employees',UserCog],['money','Money',WalletCards],['settings','Settings',Settings]].map(([id,l,I])=><button className="quick" key={id} onClick={()=>go(id)}><I size={22}/><strong>{l}</strong></button>)}</div></> }

function SimpleForm({ title, fields, defaults={}, transform=v=>v, onClose, onSave, busy, error }) {
  const [v,setV]=useState(defaults)
  return <Modal title={title} onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(transform(v))}}><div className="formgrid">{fields.map(([k,l,t,opts])=><Field key={k} label={l} span={t==='textarea'}>{t==='select'?<select value={v[k]??''} onChange={e=>setV({...v,[k]:e.target.value})}>{opts.map(o=><option key={typeof o==='string'?o:o[0]} value={typeof o==='string'?o:o[0]}>{typeof o==='string'?o:o[1]}</option>)}</select>:t==='textarea'?<textarea value={v[k]??''} onChange={e=>setV({...v,[k]:e.target.value})}/>:<input type={t} step={t==='number'?'0.01':undefined} value={v[k]??''} required={k==='name'||k==='title'} onChange={e=>setV({...v,[k]:e.target.value})}/>}</Field>)}</div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal>
}
function JobForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({business_unit:'SSPW',status:'scheduled',estimated_value:0}); return <Modal title="New SSPW job / appointment" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Customer"><select value={v.customer_id||''} onChange={e=>{const c=data.customers.find(x=>x.id===e.target.value);setV({...v,customer_id:e.target.value||null,address:c?.address||v.address})}}><option value="">Select customer</option>{data.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Assigned employee"><select value={v.employee_id||''} onChange={e=>setV({...v,employee_id:e.target.value||null})}><option value="">Unassigned</option>{data.profiles.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.full_name||p.job_title||p.role}</option>)}</select></Field><Field label="Job title"><input required value={v.title||''} onChange={e=>setV({...v,title:e.target.value})}/></Field><Field label="Service"><input value={v.service||''} onChange={e=>setV({...v,service:e.target.value})} placeholder="Driveway + walkway"/></Field><Field label="Start"><input type="datetime-local" onChange={e=>setV({...v,scheduled_start:toIso(e.target.value)})}/></Field><Field label="End"><input type="datetime-local" onChange={e=>setV({...v,scheduled_end:toIso(e.target.value)})}/></Field><Field label="Estimated price"><input type="number" step=".01" value={v.estimated_value} onChange={e=>setV({...v,estimated_value:e.target.value})}/></Field><Field label="Status"><select value={v.status} onChange={e=>setV({...v,status:e.target.value})}><option value="lead">Lead</option><option value="quoted">Quoted</option><option value="scheduled">Scheduled</option></select></Field><Field label="Address" span><input value={v.address||''} onChange={e=>setV({...v,address:e.target.value})}/></Field><Field label="Notes" span><textarea value={v.notes||''} onChange={e=>setV({...v,notes:e.target.value})}/></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function VisitForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({status:'scheduled'}); return <Modal title="Schedule vending visit" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Machine"><select required value={v.machine_id||''} onChange={e=>setV({...v,machine_id:e.target.value})}><option value="">Choose machine</option>{data.machines.filter(m=>m.status!=='retired').map(m=><option key={m.id} value={m.id}>{m.label} ({m.machine_code})</option>)}</select></Field><Field label="Employee"><select value={v.employee_id||''} onChange={e=>setV({...v,employee_id:e.target.value||null})}><option value="">Unassigned</option>{data.profiles.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.full_name||p.job_title||p.role}</option>)}</select></Field><Field label="Scheduled for"><input type="datetime-local" onChange={e=>setV({...v,scheduled_for:toIso(e.target.value)})}/></Field><Field label="Notes"><input value={v.notes||''} onChange={e=>setV({...v,notes:e.target.value})}/></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function SubscriptionForm({data,onClose,onSave,busy,error}) { const prices={Basic:25,Standard:40,Premium:60,'Commercial Starter':75,'Commercial Business':125,'Commercial Plus':200}; const [v,setV]=useState({plan_name:'Basic',monthly_price:25,cadence_days:30,status:'active',start_date:new Date().toISOString().slice(0,10)}); return <Modal title="New SSPW recurring service" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Customer"><select required value={v.customer_id||''} onChange={e=>setV({...v,customer_id:e.target.value})}><option value="">Select customer</option>{data.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Plan"><select value={v.plan_name} onChange={e=>setV({...v,plan_name:e.target.value,monthly_price:prices[e.target.value]})}>{Object.keys(prices).map(p=><option key={p}>{p}</option>)}</select></Field><Field label="Monthly price"><input type="number" step=".01" value={v.monthly_price} onChange={e=>setV({...v,monthly_price:e.target.value})}/></Field><Field label="Cadence days"><input type="number" value={v.cadence_days} onChange={e=>setV({...v,cadence_days:e.target.value})}/></Field><Field label="Start date"><input type="date" value={v.start_date} onChange={e=>setV({...v,start_date:e.target.value,next_service:e.target.value})}/></Field><Field label="Notes"><input value={v.notes||''} onChange={e=>setV({...v,notes:e.target.value})}/></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function MachineForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({machine_type:'combo',status:'active',purchase_cost:0,nayax_enabled:false}); return <Modal title="Add vending machine" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Label"><input required value={v.label||''} onChange={e=>setV({...v,label:e.target.value})}/></Field><Field label="Location"><select value={v.location_id||''} onChange={e=>setV({...v,location_id:e.target.value||null})}><option value="">Unplaced / storage</option>{data.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field><Field label="Make / model"><input value={v.make_model||''} onChange={e=>setV({...v,make_model:e.target.value})}/></Field><Field label="Serial number"><input value={v.serial_number||''} onChange={e=>setV({...v,serial_number:e.target.value})}/></Field><Field label="Card reader"><input value={v.card_reader||''} onChange={e=>setV({...v,card_reader:e.target.value})} placeholder="Nayax / Cantaloupe / other"/></Field><Field label="Purchase cost"><input type="number" step=".01" value={v.purchase_cost} onChange={e=>setV({...v,purchase_cost:e.target.value})}/></Field><Field label="Nayax"><select value={String(v.nayax_enabled)} onChange={e=>setV({...v,nayax_enabled:e.target.value==='true'})}><option value="false">Not installed</option><option value="true">Installed</option></select></Field><Field label="Status"><select value={v.status} onChange={e=>setV({...v,status:e.target.value})}><option value="active">active</option><option value="storage">storage</option><option value="maintenance">maintenance</option><option value="offline">offline</option></select></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function MaintenanceForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({status:'Reported',repair_needed:true,machine_down:false}); return <Modal title="Report machine issue" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Machine"><select required value={v.machine_id||''} onChange={e=>setV({...v,machine_id:e.target.value})}><option value="">Choose machine</option>{data.machines.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></Field><Field label="Category"><input value={v.problem_category||''} onChange={e=>setV({...v,problem_category:e.target.value})} placeholder="Refrigeration, card reader…"/></Field><Field label="Problem" span><textarea required value={v.problem||''} onChange={e=>setV({...v,problem:e.target.value})}/></Field><Field label="Machine down?"><select value={String(v.machine_down)} onChange={e=>setV({...v,machine_down:e.target.value==='true'})}><option value="false">No</option><option value="true">Yes</option></select></Field><Field label="Notes"><input value={v.notes||''} onChange={e=>setV({...v,notes:e.target.value})}/></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function EventForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({event_type:'general',business_area:'General',status:'scheduled'}); return <Modal title="New calendar event" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Title"><input required value={v.title||''} onChange={e=>setV({...v,title:e.target.value})}/></Field><Field label="Type"><select value={v.event_type} onChange={e=>setV({...v,event_type:e.target.value})}><option value="general">General</option><option value="meeting">Meeting</option><option value="deadline">Deadline</option><option value="training">Training</option><option value="route">Route</option></select></Field><Field label="Business area"><select value={v.business_area} onChange={e=>setV({...v,business_area:e.target.value})}><option>General</option><option>SSPW</option><option>SS Vending</option><option>Personal Selling</option></select></Field><Field label="Assigned to"><select value={v.assigned_to||''} onChange={e=>setV({...v,assigned_to:e.target.value||null})}><option value="">Unassigned</option>{data.profiles.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.full_name||p.job_title}</option>)}</select></Field><Field label="Starts"><input type="datetime-local" required onChange={e=>setV({...v,starts_at:toIso(e.target.value)})}/></Field><Field label="Ends"><input type="datetime-local" onChange={e=>setV({...v,ends_at:toIso(e.target.value)})}/></Field><Field label="Location"><input value={v.location||''} onChange={e=>setV({...v,location:e.target.value})}/></Field><Field label="Status"><select value={v.status} onChange={e=>setV({...v,status:e.target.value})}><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field><Field label="Notes" span><textarea value={v.notes||''} onChange={e=>setV({...v,notes:e.target.value})}/></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function RestockForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({p_inventory_before:0,p_quantity_added:0,p_inventory_after:0,p_estimated_units_sold:0,p_expired_removed:0,p_damaged_removed:0,p_revenue_generated:0,p_restock_cost:0}); const visitOptions=data.visits.filter(x=>!['cancelled'].includes(x.status)); return <Modal title="Log vending restock item" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave({...v,p_inventory_before:Number(v.p_inventory_before),p_quantity_added:Number(v.p_quantity_added),p_inventory_after:Number(v.p_inventory_after),p_estimated_units_sold:Number(v.p_estimated_units_sold),p_expired_removed:Number(v.p_expired_removed),p_damaged_removed:Number(v.p_damaged_removed),p_revenue_generated:Number(v.p_revenue_generated),p_restock_cost:Number(v.p_restock_cost)})}}><div className="formgrid"><Field label="Visit"><select required value={v.p_visit_id||''} onChange={e=>setV({...v,p_visit_id:e.target.value})}><option value="">Choose visit</option>{visitOptions.map(x=><option key={x.id} value={x.id}>{x.visit_code} • {data.machines.find(m=>m.id===x.machine_id)?.label||'Machine'}</option>)}</select></Field><Field label="Product"><select required value={v.p_product_id||''} onChange={e=>setV({...v,p_product_id:e.target.value})}><option value="">Choose product</option>{data.products.filter(p=>p.business_unit==='SS'&&p.active!==false).map(p=><option key={p.id} value={p.id}>{p.name} ({p.current_stock} warehouse)</option>)}</select></Field><Field label="Machine stock before"><input type="number" min="0" value={v.p_inventory_before} onChange={e=>setV({...v,p_inventory_before:e.target.value})}/></Field><Field label="Quantity added"><input type="number" min="0" value={v.p_quantity_added} onChange={e=>setV({...v,p_quantity_added:e.target.value})}/></Field><Field label="Machine stock after"><input type="number" min="0" value={v.p_inventory_after} onChange={e=>setV({...v,p_inventory_after:e.target.value})}/></Field><Field label="Estimated units sold"><input type="number" min="0" value={v.p_estimated_units_sold} onChange={e=>setV({...v,p_estimated_units_sold:e.target.value})}/></Field><Field label="Expired removed"><input type="number" min="0" value={v.p_expired_removed} onChange={e=>setV({...v,p_expired_removed:e.target.value})}/></Field><Field label="Damaged removed"><input type="number" min="0" value={v.p_damaged_removed} onChange={e=>setV({...v,p_damaged_removed:e.target.value})}/></Field><Field label="Revenue generated"><input type="number" step=".01" min="0" value={v.p_revenue_generated} onChange={e=>setV({...v,p_revenue_generated:e.target.value})}/></Field><Field label="Restock cost"><input type="number" step=".01" min="0" value={v.p_restock_cost} onChange={e=>setV({...v,p_restock_cost:e.target.value})}/></Field><Field label="Notes" span><textarea value={v.p_notes||''} onChange={e=>setV({...v,p_notes:e.target.value})}/></Field></div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }
function InventoryAdjustForm({data,onClose,onSave,busy,error}) { const [v,setV]=useState({quantity_delta:1,movement_type:'purchase'}); return <Modal title="Adjust inventory" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(v)}}><div className="formgrid"><Field label="Product"><select required value={v.product_id||''} onChange={e=>setV({...v,product_id:e.target.value})}><option value="">Choose product</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.business_unit==='SS'?'Vending':p.business_unit} • {p.name} ({p.current_stock})</option>)}</select></Field><Field label="Change in units"><input type="number" step="1" required value={v.quantity_delta} onChange={e=>setV({...v,quantity_delta:e.target.value})}/></Field><Field label="Movement type"><select value={v.movement_type} onChange={e=>setV({...v,movement_type:e.target.value})}><option value="purchase">Purchase / stock in</option><option value="adjustment">Adjustment</option><option value="return">Return</option><option value="waste">Waste / damage</option><option value="correction">Count correction</option></select></Field><Field label="Notes"><input value={v.notes||''} onChange={e=>setV({...v,notes:e.target.value})}/></Field></div><div className="small muted">Use a positive number to add stock and a negative number to remove stock.</div>{error}<FormButtons busy={busy} onClose={onClose}/></form></Modal> }

function Forms({ modal, data, close, refresh }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{setError('');setBusy(false)},[modal?.type])
  if(!modal)return null
  const run=async fn=>{setBusy(true);setError('');try{await fn();close();await refresh()}catch(e){setError(e.message||String(e))}finally{setBusy(false)}}
  const commonError=error&&<div className="notice error" style={{marginTop:12}}>{error}</div>
  if(modal.type==='quick') return <Modal title="Log activity" onClose={close}><div className="quickgrid"><button className="quick" onClick={()=>modal.setType('job')}><Droplets/><strong>SSPW job</strong></button><button className="quick" onClick={()=>modal.setType('visit')}><Store/><strong>Vending visit</strong></button><button className="quick" onClick={()=>modal.setType('sale')}><ShoppingCart/><strong>PSSS sale</strong></button><button className="quick" onClick={()=>modal.setType('transaction')}><WalletCards/><strong>Money entry</strong></button><button className="quick" onClick={()=>modal.setType('event')}><CalendarDays/><strong>Calendar event</strong></button></div></Modal>
  if(modal.type==='customer') return <SimpleForm title="New customer" fields={[['name','Name','text'],['phone','Phone','tel'],['email','Email','email'],['address','Address','text'],['city','City','text'],['customer_type','Type','select',['residential','commercial','internal']],['notes','Notes','textarea']]} defaults={{customer_type:'residential'}} onClose={close} onSave={v=>run(()=>api.createCustomer(v))} busy={busy} error={commonError}/>
  if(modal.type==='job') return <JobForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(async()=>{const j=await api.createJob(v);if(v.employee_id)await api.assignJob(j.id,v.employee_id)})}/>
  if(modal.type==='completeJob') return <SimpleForm title={`Complete ${modal.item.job_code}`} fields={[['actual_revenue','Revenue','number'],['direct_cost','Direct cost','number'],['payment_method','Payment method','select',['Cash','Apple Cash','Zelle','Card','Other']],['payment_status','Payment status','select',['paid','pending','unpaid']],['account','Account','select',['SS Cash','SS Bank','Apple Cash','Other']],['notes','Completion notes','textarea']]} defaults={{actual_revenue:modal.item.estimated_value||0,direct_cost:modal.item.direct_cost||0,payment_method:'Cash',payment_status:'paid',account:'SS Cash'}} onClose={close} onSave={v=>run(()=>api.completeJob(modal.item.id,v))} busy={busy} error={commonError}/>
  if(modal.type==='visit') return <VisitForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.createVisit(v))}/>
  if(modal.type==='completeVisit') return <SimpleForm title={`Complete ${modal.item.visit_code}`} fields={[['cash_collected','Cash collected','number'],['card_sales','Card sales','number'],['restock_cost','Restock cost','number'],['location_fee','Location fee','number'],['card_fees','Card fees','number'],['other_cost','Other cost','number'],['cash_account','Cash account','select',['SS Cash','SS Bank','Apple Cash','Other']],['card_account','Card account','select',['SS Bank','SS Cash','Other']],['notes','Notes','textarea']]} defaults={{cash_collected:0,card_sales:0,restock_cost:0,location_fee:0,card_fees:0,other_cost:0,cash_account:'SS Cash',card_account:'SS Bank'}} onClose={close} onSave={v=>run(()=>api.completeVisit(modal.item.id,v))} busy={busy} error={commonError}/>
  if(modal.type==='sale') return <SaleForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.recordPsssSale(v))}/>
  if(modal.type==='subscription') return <SubscriptionForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.createSubscription(v))}/>
  if(modal.type==='location') return <SimpleForm title="New vending location" fields={[['name','Location name','text'],['business_name','Business name','text'],['address','Address','text'],['city','City','text'],['contact_name','Contact','text'],['contact_phone','Contact phone','tel'],['contact_email','Contact email','email'],['commission_pct','Commission decimal (0.10 = 10%)','number'],['fixed_rent','Monthly rent','number'],['estimated_monthly_sales','Estimated monthly sales','number'],['agreement_signed','Agreement signed?','select',[['false','No'],['true','Yes']]],['notes','Notes','textarea']]} defaults={{commission_pct:0,fixed_rent:0,agreement_signed:'false'}} transform={v=>({...v,agreement_signed:v.agreement_signed==='true'})} onClose={close} onSave={v=>run(()=>api.createLocation(v))} busy={busy} error={commonError}/>
  if(modal.type==='machine') return <MachineForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.createMachine(v))}/>
  if(modal.type==='maintenance') return <MaintenanceForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.createMaintenance(v))}/>
  if(modal.type==='event') return <EventForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.createCalendarEvent(v))}/>
  if(modal.type==='restockItem') return <RestockForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.addRestockItem(v))}/>
  if(modal.type==='inventoryAdjust') return <InventoryAdjustForm data={data} onClose={close} busy={busy} error={commonError} onSave={v=>run(()=>api.adjustInventory(v.product_id,v.quantity_delta,v.movement_type,v.notes))}/>
  if(modal.type==='transaction') return <SimpleForm title="New money entry" fields={[['occurred_at','Date/time','datetime-local'],['business_area','Business area','select',['SSPW','SS Vending','Personal Selling','General']],['account','Account','select',['SS Cash','SS Bank','Apple Cash','Personal Account','Other']],['direction','Direction','select',[['In','Income / money in'],['Out','Expense / money out']]],['status','Status','select',['Cleared','Pending']],['source_category','Category','text'],['amount','Amount','number'],['notes','Notes','textarea']]} defaults={{occurred_at:new Date().toISOString().slice(0,16),business_area:'General',account:'SS Cash',direction:'Out',status:'Cleared',source_category:'Other',amount:0}} transform={v=>({...v,occurred_at:toIso(v.occurred_at),amount:Number(v.amount)})} onClose={close} onSave={v=>run(()=>api.createTransaction(v))} busy={busy} error={commonError}/>
  if(modal.type==='productAny') return <SimpleForm title="New inventory product" fields={[['business_unit','Division','select',[['SS','Vending'],['PSSS','PSSS']]],['name','Product name','text'],['brand','Brand','text'],['category','Category','text'],['unit_cost','Unit cost','number'],['sell_price','Sell price','number'],['current_stock','Starting stock','number'],['reorder_level','Reorder level','number'],['notes','Notes','textarea']]} defaults={{business_unit:'SS',unit_cost:0,sell_price:0,current_stock:0,reorder_level:0}} onClose={close} onSave={v=>run(()=>api.createProduct(v))} busy={busy} error={commonError}/>
  return null
}

export default function OpsV2() {
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [data,setData]=useState(emptyData)
  const [loading,setLoading]=useState(true)
  const [page,setPage]=useState(pageFromHash())
  const [modalState,setModalState]=useState(null)
  const [recovery,setRecovery]=useState(false)

  const refresh=async()=>{try{setData(await api.loadAll())}catch(e){console.error('Ops refresh failed',e)}}
  const boot=async()=>{
    setLoading(true)
    const {data:{session:s}}=await supabase.auth.getSession()
    setSession(s)
    if(s){try{const p=await api.ensureProfile();setProfile(p);await refresh()}catch(e){if(e.code!=='STAFF_APPROVAL_REQUIRED')console.error(e)}}
    setLoading(false)
  }
  useEffect(()=>{
    boot()
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{
      setSession(s)
      if(event==='PASSWORD_RECOVERY') setRecovery(true)
      if(!s){setProfile(null);setData(emptyData)}
    })
    const h=()=>setPage(pageFromHash())
    addEventListener('hashchange',h)
    return()=>{subscription.unsubscribe();removeEventListener('hashchange',h)}
  },[])
  const open=(type,item=null)=>setModalState({type,item,setType:t=>setModalState(m=>({...m,type:t}))})
  if(loading)return <div className="loginpage"><div className="muted">Loading SwiftSupply Ops…</div></div>
  if(recovery&&session)return <ChangePassword onDone={()=>{setRecovery(false);location.hash='#/home';boot()}}/>
  if(!session)return <Login onReady={boot}/>
  if(!profile)return <div className="loginpage"><div className="muted">Checking staff access…</div></div>
  const props={data,refresh,open,profile,setPage}
  const content=page==='home'?<Dashboard {...props}/>:page==='schedule'?<Schedule {...props}/>:page==='work'?<Work {...props}/>:page==='customers'?<Customers {...props}/>:page==='vending'?<Vending {...props}/>:page==='inventory'?<Inventory {...props}/>:page==='employees'?<Employees {...props}/>:page==='money'?<Money {...props}/>:page==='settings'?<SettingsPage {...props}/>:<More {...props}/>
  return <Shell profile={profile} page={page} setPage={setPage}>{content}<Forms modal={modalState} data={data} close={()=>setModalState(null)} refresh={refresh}/></Shell>
}
