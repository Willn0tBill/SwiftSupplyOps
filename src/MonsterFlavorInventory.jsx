import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import { triggerSync } from './lib/api'

export default function MonsterFlavorInventory() {
  const [page,setPage] = useState(() => location.hash)
  const [target,setTarget] = useState(null)
  const [open,setOpen] = useState(false)
  const [parent,setParent] = useState(null)
  const [variants,setVariants] = useState([])
  const [counts,setCounts] = useState({})
  const [search,setSearch] = useState('')
  const [recount,setRecount] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')

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

  async function load() {
    setError(''); setNotice('')
    const { data:p,error:pe } = await supabase.from('ops_products').select('id,name,current_stock,unit_cost').eq('business_unit','PSSS').eq('name','Monster Energy').maybeSingle()
    if (pe) throw pe
    if (!p) throw new Error('Monster Energy is missing from Ops inventory.')
    const { data:v,error:ve } = await supabase.from('ops_product_variants').select('id,product_id,website_product_id,flavor,current_stock,active').eq('product_id',p.id).eq('active',true).order('flavor')
    if (ve) throw ve
    setParent(p)
    setVariants(v || [])
    setCounts(Object.fromEntries((v || []).map(x => [x.id, Number(x.current_stock || 0)])))
  }

  async function show() {
    setOpen(true)
    try { await load() } catch(e) { setError(e.message || String(e)) }
  }

  const assigned = useMemo(() => variants.reduce((n,v) => n + Math.max(0, Number(counts[v.id] || 0)), 0), [variants,counts])
  const physical = Number(parent?.current_stock || 0)
  const unassigned = Math.max(0, physical - assigned)
  const filtered = variants.filter(v => !search.trim() || v.flavor.toLowerCase().includes(search.trim().toLowerCase()))

  async function save() {
    if (!parent || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = variants.map(v => ({ variant_id:v.id, stock:Math.max(0, Math.floor(Number(counts[v.id] || 0))) }))
      const { data,error:rpcError } = await supabase.rpc('ops_set_variant_inventory', {
        p_product_id: parent.id,
        p_counts: payload,
        p_set_parent_total: recount
      })
      if (rpcError) throw rpcError
      await triggerSync()
      setNotice(`Saved. ${data?.assigned_total ?? assigned} cans assigned to flavors${data?.unassigned ? ` • ${data.unassigned} still unassigned` : ''}.`)
      setRecount(false)
      await load()
    } catch(e) {
      setError(e.message || 'Could not save Monster flavor inventory.')
    } finally { setBusy(false) }
  }

  return <>
    {target && createPortal(<button type="button" className="btn" onClick={show}>Monster flavors</button>, target)}
    {open && createPortal(<div className="modalback" style={{zIndex:9700}} onMouseDown={e => e.target===e.currentTarget && !busy && setOpen(false)}>
      <div className="modal" style={{width:'min(860px, calc(100vw - 24px))',maxWidth:860,maxHeight:'90vh',overflowY:'auto'}}>
        <div className="modalhead">
          <div><h2 style={{marginBottom:2}}>Monster flavor inventory</h2><div className="small muted">Ops keeps one Monster total for accounting/Sheets, while the website uses these exact flavor counts.</div></div>
          <button type="button" className="iconbtn" disabled={busy} onClick={()=>setOpen(false)}>×</button>
        </div>

        <div className="grid metrics" style={{marginBottom:14}}>
          <div className="metric"><div className="label">Physical Monster total</div><div className="value">{physical}</div><div className="sub">The number Sheets keeps as Monster Energy</div></div>
          <div className="metric"><div className="label">Assigned to flavors</div><div className="value">{assigned}</div><div className="sub">Website flavor inventory</div></div>
          <div className="metric"><div className="label">Unassigned</div><div className="value">{unassigned}</div><div className="sub">In Ops, but not sellable online by flavor yet</div></div>
        </div>

        <label className="field" style={{marginBottom:12}}><span>Find flavor</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Mango Loco, White, Guava…" /></label>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(245px,1fr))',gap:10}}>
          {filtered.map(v => <label key={v.id} className="card" style={{padding:12,display:'grid',gridTemplateColumns:'1fr 86px',alignItems:'center',gap:10}}>
            <div><strong>{v.flavor}</strong><div className="small muted">Website stock for this flavor</div></div>
            <input aria-label={`${v.flavor} stock`} type="number" min="0" step="1" value={counts[v.id] ?? 0} onChange={e=>setCounts(c=>({...c,[v.id]:e.target.value}))} />
          </label>)}
        </div>

        {!filtered.length && <div className="empty" style={{marginTop:12}}>No matching Monster flavor.</div>}

        <label className="card" style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:14,padding:12}}>
          <input type="checkbox" checked={recount} onChange={e=>setRecount(e.target.checked)} style={{marginTop:3}} />
          <div><strong>Use the flavor total as the physical Monster count</strong><div className="small muted">Use this after a full physical recount. If unchecked, flavor counts are only a breakdown of the current {physical} cans and cannot exceed it.</div></div>
        </label>

        {assigned>physical && !recount && <div className="notice error" style={{marginTop:12}}>Flavor counts add up to {assigned}, which is more than the {physical} physical Monster cans in Ops. Lower the counts or enable the recount option.</div>}
        {notice && <div className="notice" style={{marginTop:12}}>{notice}</div>}
        {error && <div className="notice error" style={{marginTop:12}}>{error}</div>}

        <div className="actions" style={{marginTop:16,justifyContent:'flex-end'}}>
          <button type="button" className="btn" disabled={busy} onClick={()=>setOpen(false)}>Close</button>
          <button type="button" className="btn primary" disabled={busy || (!recount && assigned>physical)} onClick={save}>{busy?'Saving…':'Save flavor stock'}</button>
        </div>
      </div>
    </div>,document.body)}
  </>
}
