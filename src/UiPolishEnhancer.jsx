import React, { useEffect, useRef, useState } from 'react'
import { Boxes, Calculator, ChevronUp, PackagePlus, ShoppingCart, Store, Ticket, WalletCards, X } from 'lucide-react'
import { supabase } from './lib/supabase'

const clickByText = (selector, text) => {
  const node = [...document.querySelectorAll(selector)].find(el => el.textContent?.toLowerCase().includes(text.toLowerCase()))
  if (node) node.click()
  return Boolean(node)
}

export default function UiPolishEnhancer() {
  const [authorized, setAuthorized] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

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
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (authorized) setOpen(v => !v)
      }
    }
    const onPointer = e => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    addEventListener('keydown', onKey)
    addEventListener('pointerdown', onPointer)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('pointerdown', onPointer)
    }
  }, [open, authorized])

  if (!authorized) return null

  const openOrders = (mode = null) => {
    document.querySelector('button[aria-label="Open PSSS sales and preorders"]')?.click()
    if (mode) setTimeout(() => clickByText('.modal button', mode), 80)
    setOpen(false)
  }

  const openPasses = () => {
    document.querySelector('button[aria-label="Open PSSS drink subscriptions"]')?.click()
    setOpen(false)
  }

  const openQuote = () => {
    document.querySelector('.sspw-quote-fab')?.click()
    setOpen(false)
  }

  const go = page => {
    location.hash = `#/${page}`
    setOpen(false)
  }

  return <div className="quickhub" ref={wrapRef}>
    {open && <div className="quickhub-menu" role="menu" aria-label="Quick actions">
      <div className="quickhub-head">
        <div><strong>Quick actions</strong><span>Run the things you use most</span></div>
        <button className="quickhub-close" onClick={() => setOpen(false)} aria-label="Close quick actions"><X size={16}/></button>
      </div>
      <button onClick={() => openOrders('Quick paid sale')}><span className="quickhub-icon"><ShoppingCart size={18}/></span><span><strong>Quick paid sale</strong><small>Sell now and update inventory</small></span></button>
      <button onClick={() => openOrders('New preorder')}><span className="quickhub-icon"><PackagePlus size={18}/></span><span><strong>New preorder</strong><small>Reserve stock before pickup</small></span></button>
      <button onClick={openPasses}><span className="quickhub-icon"><Ticket size={18}/></span><span><strong>Drink passes</strong><small>Subscribers and redemptions</small></span></button>
      <button onClick={openQuote}><span className="quickhub-icon"><Calculator size={18}/></span><span><strong>SSPW quote</strong><small>Build a pressure-washing quote</small></span></button>
      <div className="quickhub-divider" />
      <button onClick={() => go('vending')}><span className="quickhub-icon"><Store size={18}/></span><span><strong>Vending</strong><small>Machines, locations and visits</small></span></button>
      <button onClick={() => go('inventory')}><span className="quickhub-icon"><Boxes size={18}/></span><span><strong>Inventory</strong><small>Stock and product costs</small></span></button>
      <button onClick={() => go('money')}><span className="quickhub-icon"><WalletCards size={18}/></span><span><strong>Money</strong><small>Accounts and transactions</small></span></button>
      <div className="quickhub-hint">Ctrl / ⌘ + K</div>
    </div>}
    <button className={`quickhub-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(v => !v)} aria-expanded={open}>
      <span className="quickhub-plus">+</span><span>Quick action</span><ChevronUp size={16}/>
    </button>
  </div>
}
