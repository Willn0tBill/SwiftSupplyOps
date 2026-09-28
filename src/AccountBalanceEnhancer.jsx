import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))
const when = v => v ? new Date(v).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'

export default function AccountBalanceEnhancer() {
  const [page, setPage] = useState(() => location.hash)
  const [moneyTarget, setMoneyTarget] = useState(null)
  const [moneyPageTarget, setMoneyPageTarget] = useState(null)
  const [dashboardTarget, setDashboardTarget] = useState(null)
  const [balances, setBalances] = useState([])
  const [transfers, setTransfers] = useState([])
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')
  const [transfer, setTransfer] = useState(null)
  const [newAccount, setNewAccount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const totalBalance = useMemo(
    () => balances.reduce((sum, row) => sum + Number(row.balance || 0), 0),
    [balances]
  )

  const load = async () => {
    const [{ data: balanceRows, error: balanceError }, { data: transferRows }] = await Promise.all([
      supabase.from('ops_account_balances').select('*').order('account'),
      supabase.from('ops_account_transfers').select('*').order('created_at', { ascending:false }).limit(25)
    ])
    if (!balanceError) setBalances(balanceRows || [])
    setTransfers(transferRows || [])
  }

  useEffect(() => {
    const onHash = () => setPage(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onBalanceChanged = () => load()
    addEventListener('swiftsupply-balance-changed', onBalanceChanged)
    return () => removeEventListener('swiftsupply-balance-changed', onBalanceChanged)
  }, [])

  useEffect(() => {
    const isMoney = page.includes('#/money')
    const isHome = page.includes('#/home') || page.endsWith('#/') || !page.includes('#/')
    if (!isMoney && !isHome) {
      setMoneyTarget(null)
      setMoneyPageTarget(null)
      setDashboardTarget(null)
      return
    }

    load()
    const scan = () => {
      if (isMoney) {
        setMoneyTarget(document.querySelector('.main .grid.metrics'))
        setMoneyPageTarget(document.querySelector('.main'))
        setDashboardTarget(null)
      } else {
        setDashboardTarget(document.querySelector('.main .grid.metrics'))
        setMoneyTarget(null)
        setMoneyPageTarget(null)
      }
    }
    scan()
    const timer = setInterval(scan, 350)
    return () => clearInterval(timer)
  }, [page])

  // Keep account pickers in PSSS sales and Money Entry aware of newly added accounts.
  useEffect(() => {
    if (!balances.length) return
    const syncAccountSelects = () => {
      document.querySelectorAll('.modal').forEach(modal => {
        const title = modal.querySelector('h2')?.textContent?.trim() || ''
        if (title !== 'Log PSSS sale' && title !== 'New money entry') return
        modal.querySelectorAll('.field').forEach(field => {
          const label = (field.querySelector('label')?.textContent || field.querySelector('span')?.textContent || '').trim()
          const wanted = title === 'Log PSSS sale' ? label === 'Deposit account' : label === 'Account'
          if (!wanted) return
          const select = field.querySelector('select')
          if (!select) return
          balances.forEach(row => {
            if (![...select.options].some(o => o.value === row.account)) select.add(new Option(row.account, row.account))
          })
        })
      })
    }
    syncAccountSelects()
    const observer = new MutationObserver(syncAccountSelects)
    observer.observe(document.body, { childList:true, subtree:true })
    const timer = setInterval(syncAccountSelects, 500)
    return () => { observer.disconnect(); clearInterval(timer) }
  }, [balances])

  const flash = text => {
    setNotice(text)
    setTimeout(() => setNotice(''), 2600)
  }

  const changed = async text => {
    await load()
    window.dispatchEvent(new Event('swiftsupply-balance-changed'))
    flash(text)
  }

  const openEdit = row => {
    setEditing(row)
    setValue(Number(row.balance).toFixed(2))
    setError('')
  }

  const saveBalance = async e => {
    e.preventDefault()
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter a valid non-negative balance.')
    setBusy(true); setError('')
    const { data: authData } = await supabase.auth.getUser()
    const { error } = await supabase.from('ops_account_balances').update({
      balance: amount,
      updated_at: new Date().toISOString(),
      updated_by: authData?.user?.id || null
    }).eq('account', editing.account)
    if (error) setError(error.message)
    else { setEditing(null); await changed('Balance corrected') }
    setBusy(false)
  }

  const startTransfer = from => {
    const to = balances.find(x => x.account !== from)?.account || ''
    setTransfer({ from, to, amount:'', notes:'' })
    setError('')
  }

  const saveTransfer = async e => {
    e.preventDefault()
    const amount = Number(transfer.amount)
    if (!transfer.from || !transfer.to) return setError('Choose both accounts.')
    if (transfer.from === transfer.to) return setError('Choose two different accounts.')
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a transfer amount greater than zero.')
    setBusy(true); setError('')
    const { error } = await supabase.rpc('ops_transfer_funds', {
      p_from_account: transfer.from,
      p_to_account: transfer.to,
      p_amount: amount,
      p_notes: transfer.notes || null
    })
    if (error) setError(error.message)
    else { setTransfer(null); await changed(`${money(amount)} transferred`) }
    setBusy(false)
  }

  const saveNewAccount = async e => {
    e.preventDefault()
    const name = newAccount.name.trim()
    const amount = Number(newAccount.balance || 0)
    if (!name) return setError('Enter an account name.')
    if (!Number.isFinite(amount) || amount < 0) return setError('Starting balance cannot be negative.')
    if (balances.some(x => x.account.toLowerCase() === name.toLowerCase())) return setError('That account already exists.')
    setBusy(true); setError('')
    const { data: authData } = await supabase.auth.getUser()
    const { error } = await supabase.from('ops_account_balances').insert({
      account: name,
      balance: amount,
      notes: newAccount.notes || null,
      updated_by: authData?.user?.id || null
    })
    if (error) setError(error.message)
    else { setNewAccount(null); await changed(`${name} added`) }
    setBusy(false)
  }

  return <>
    {dashboardTarget && balances.length > 0 && createPortal(
      <div className="metric" style={{ order:-1 }}>
        <div className="label">Total money</div>
        <div className="value">{money(totalBalance)}</div>
        <div className="sub">Across {balances.length} tracked account{balances.length === 1 ? '' : 's'}</div>
      </div>, dashboardTarget
    )}

    {moneyTarget && balances.length > 0 && createPortal(
      <div className="metric" style={{ order:-1 }}>
        <div className="label">Total money</div>
        <div className="value">{money(totalBalance)}</div>
        <div className="sub">Moving money between accounts does not change this total</div>
      </div>, moneyTarget
    )}

    {moneyPageTarget && balances.length > 0 && createPortal(<>
      <div className="card" style={{ marginTop:16 }}>
        <div className="sectionhead">
          <div><h2 style={{ marginBottom:4 }}>Accounts</h2><div className="small muted">Individual balances that update from new cleared money activity.</div></div>
          <div className="actions" style={{ flexWrap:'wrap' }}>
            <button type="button" className="btn" onClick={() => setNewAccount({ name:'', balance:'0', notes:'' })}>+ Account</button>
            <button type="button" className="btn primary" disabled={balances.length < 2} onClick={() => startTransfer(balances.find(x => Number(x.balance) > 0)?.account || balances[0].account)}>Transfer money</button>
          </div>
        </div>
        {notice && <div className="notice" style={{ marginBottom:12 }}>{notice}</div>}
        <div className="grid metrics">
          {balances.map(row => <div className="metric" key={row.account}>
            <div className="label">{row.account}</div>
            <div className="value">{money(row.balance)}</div>
            <div className="sub">Tracked balance</div>
            <div className="actions" style={{ marginTop:10, flexWrap:'wrap' }}>
              <button type="button" className="btn sm" onClick={() => startTransfer(row.account)} disabled={balances.length < 2 || Number(row.balance) <= 0}>Transfer</button>
              <button type="button" className="btn sm" onClick={() => openEdit(row)}>Correct balance</button>
            </div>
          </div>)}
        </div>
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="sectionhead"><h2>Recent account transfers</h2><span className="small muted">Internal moves only — not revenue or expenses</span></div>
        <div className="list">
          {transfers.length ? transfers.map(t => <div className="rowcard" key={t.id}>
            <div><div className="title">{t.from_account} → {t.to_account}</div><div className="meta">{when(t.created_at)}{t.notes ? ` • ${t.notes}` : ''}</div></div>
            <strong>{money(t.amount)}</strong>
          </div>) : <div className="empty">No transfers yet.</div>}
        </div>
      </div>
    </>, moneyPageTarget)}

    {editing && createPortal(<div className="modalback" onMouseDown={e => e.target === e.currentTarget && !busy && setEditing(null)}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modalhead"><h2>Correct {editing.account}</h2><button type="button" className="iconbtn" disabled={busy} onClick={() => setEditing(null)}>×</button></div>
        <form onSubmit={saveBalance}>
          <div className="field"><label>Actual current balance</label><input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} autoFocus /></div>
          <p className="small muted">Use this only to correct the real balance. New cleared sales and expenses will adjust tracked accounts automatically.</p>
          {error && <div className="notice error">{error}</div>}
          <div className="actions" style={{ marginTop:16, justifyContent:'flex-end' }}><button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save balance'}</button></div>
        </form>
      </div>
    </div>, document.body)}

    {transfer && createPortal(<div className="modalback" onMouseDown={e => e.target === e.currentTarget && !busy && setTransfer(null)}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modalhead"><h2>Transfer money</h2><button type="button" className="iconbtn" disabled={busy} onClick={() => setTransfer(null)}>×</button></div>
        <form onSubmit={saveTransfer}>
          <div className="formgrid">
            <div className="field"><label>From account</label><select value={transfer.from} onChange={e => setTransfer(v => ({ ...v, from:e.target.value }))}>{balances.map(a => <option key={a.account} value={a.account}>{a.account} — {money(a.balance)}</option>)}</select></div>
            <div className="field"><label>To account</label><select value={transfer.to} onChange={e => setTransfer(v => ({ ...v, to:e.target.value }))}>{balances.map(a => <option key={a.account} value={a.account}>{a.account} — {money(a.balance)}</option>)}</select></div>
            <div className="field"><label>Amount</label><input type="number" min="0.01" step="0.01" value={transfer.amount} onChange={e => setTransfer(v => ({ ...v, amount:e.target.value }))} autoFocus /></div>
            <div className="field"><label>Note</label><input value={transfer.notes} onChange={e => setTransfer(v => ({ ...v, notes:e.target.value }))} placeholder="Optional" /></div>
          </div>
          <p className="small muted">This only moves money between your accounts. Total Money stays the same.</p>
          {error && <div className="notice error">{error}</div>}
          <div className="actions" style={{ marginTop:16, justifyContent:'flex-end' }}><button type="button" className="btn" onClick={() => setTransfer(null)} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Moving…' : 'Transfer'}</button></div>
        </form>
      </div>
    </div>, document.body)}

    {newAccount && createPortal(<div className="modalback" onMouseDown={e => e.target === e.currentTarget && !busy && setNewAccount(null)}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modalhead"><h2>Add money account</h2><button type="button" className="iconbtn" disabled={busy} onClick={() => setNewAccount(null)}>×</button></div>
        <form onSubmit={saveNewAccount}>
          <div className="formgrid">
            <div className="field"><label>Account name</label><input value={newAccount.name} onChange={e => setNewAccount(v => ({ ...v, name:e.target.value }))} placeholder="Example: Apple Cash" autoFocus /></div>
            <div className="field"><label>Current starting balance</label><input type="number" min="0" step="0.01" value={newAccount.balance} onChange={e => setNewAccount(v => ({ ...v, balance:e.target.value }))} /></div>
            <div className="field"><label>Notes</label><input value={newAccount.notes} onChange={e => setNewAccount(v => ({ ...v, notes:e.target.value }))} placeholder="Optional" /></div>
          </div>
          <p className="small muted">The starting balance is a snapshot, not income. Future cleared activity in this account will update it automatically.</p>
          {error && <div className="notice error">{error}</div>}
          <div className="actions" style={{ marginTop:16, justifyContent:'flex-end' }}><button type="button" className="btn" onClick={() => setNewAccount(null)} disabled={busy}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add account'}</button></div>
        </form>
      </div>
    </div>, document.body)}
  </>
}
