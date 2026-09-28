import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

export default function AccountBalanceEnhancer() {
  const [page, setPage] = useState(() => location.hash)
  const [moneyTarget, setMoneyTarget] = useState(null)
  const [dashboardTarget, setDashboardTarget] = useState(null)
  const [balances, setBalances] = useState([])
  const [ledgerNet, setLedgerNet] = useState(0)
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    const [{ data: balanceRows, error: balanceError }, { data: txRows }] = await Promise.all([
      supabase.from('ops_account_balances').select('*').order('account'),
      supabase.from('ops_transactions').select('direction,status,amount').eq('status', 'Cleared')
    ])
    if (!balanceError) setBalances(balanceRows || [])
    const net = (txRows || []).reduce((sum, row) => sum + (row.direction === 'In' ? Number(row.amount || 0) : -Number(row.amount || 0)), 0)
    setLedgerNet(net)
  }

  useEffect(() => {
    const onHash = () => setPage(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!page.includes('#/money') && !page.includes('#/home') && !page.endsWith('#/')) {
      setMoneyTarget(null)
      setDashboardTarget(null)
      return
    }

    load()
    const scan = () => {
      if (page.includes('#/money')) {
        setMoneyTarget(document.querySelector('.main .grid.metrics'))
        setDashboardTarget(null)
        return
      }
      setMoneyTarget(null)
      const metrics = [...document.querySelectorAll('.main .grid.metrics .metric')]
      const first = metrics.find(el => el.querySelector('.label')?.textContent?.trim() === 'Company net movement') || metrics[0] || null
      setDashboardTarget(first)
    }
    scan()
    const timer = setInterval(scan, 300)
    return () => clearInterval(timer)
  }, [page])

  useEffect(() => {
    if (!dashboardTarget) return
    const original = [...dashboardTarget.children]
    original.forEach(node => { node.dataset.balanceEnhancerHidden = '1'; node.style.display = 'none' })
    return () => original.forEach(node => {
      if (node.dataset.balanceEnhancerHidden === '1') {
        node.style.display = ''
        delete node.dataset.balanceEnhancerHidden
      }
    })
  }, [dashboardTarget])

  const openEdit = row => {
    setEditing(row)
    setValue(Number(row.balance).toFixed(2))
    setError('')
  }

  const save = async e => {
    e.preventDefault()
    const amount = Number(value)
    if (!Number.isFinite(amount)) return setError('Enter a valid balance.')
    setBusy(true)
    setError('')
    const { data: authData } = await supabase.auth.getUser()
    const { error } = await supabase.from('ops_account_balances').update({
      balance: amount,
      updated_at: new Date().toISOString(),
      updated_by: authData?.user?.id || null
    }).eq('account', editing.account)
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    await load()
    setEditing(null)
    setNotice('Balance updated')
    setTimeout(() => setNotice(''), 2500)
    setBusy(false)
  }

  const personal = balances.find(row => row.account === 'Personal Account') || balances[0]

  return <>
    {dashboardTarget && personal && createPortal(<>
      <div className="label">Personal / PSSS balance</div>
      <div className="value">{money(personal.balance)}</div>
      <div className="sub">Current account snapshot • recorded operating net {money(ledgerNet)}</div>
    </>, dashboardTarget)}

    {moneyTarget && balances.length > 0 && createPortal(<>
      {balances.map(row => <div className="metric" key={row.account}>
        <div className="label">{row.account} balance</div>
        <div className="value">{money(row.balance)}</div>
        <div className="sub">Balance snapshot • not counted as revenue</div>
        <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => openEdit(row)}>Update balance</button>
      </div>)}
      {notice && <div className="notice" style={{ gridColumn: '1 / -1' }}>{notice}</div>}
    </>, moneyTarget)}

    {editing && createPortal(<div className="modalback" onMouseDown={e => e.target === e.currentTarget && !busy && setEditing(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="balance-title">
        <div className="modalhead"><h2 id="balance-title">Update {editing.account}</h2><button type="button" className="iconbtn" disabled={busy} onClick={() => setEditing(null)}>×</button></div>
        <form onSubmit={save}>
          <div className="field"><label>Current balance</label><input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} autoFocus /></div>
          <p className="small muted">This updates the account balance snapshot only. It does not create income or an expense.</p>
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}><button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save balance'}</button></div>
        </form>
      </div>
    </div>, document.body)}
  </>
}
