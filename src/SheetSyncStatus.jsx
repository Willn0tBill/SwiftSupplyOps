import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from './lib/supabase'

const appsScriptHome = 'https://script.google.com/home/start'
const bridgeCode = 'https://github.com/Willn0tBill/SwiftSupplyOps/blob/main/integrations/google-apps-script.gs'

const makeSecret = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function SheetSyncStatus() {
  const [hash, setHash] = useState(location.hash)
  const [slot, setSlot] = useState(null)
  const [role, setRole] = useState(null)
  const [status, setStatus] = useState(null)
  const [url, setUrl] = useState('')
  const [setupSecret, setSetupSecret] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const onSettings = hash.replace('#/', '') === 'settings'
  const canView = ['owner', 'manager'].includes(role)
  const isOwner = role === 'owner'

  const stateLabel = useMemo(() => {
    if (!status) return 'Checking…'
    if (status.configured) return 'Connected'
    if (!status.webhook_configured) return 'Google endpoint missing'
    if (!status.shared_secret_configured) return 'Shared secret missing'
    return 'Setup incomplete'
  }, [status])

  const load = async () => {
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) return
    const { data: me, error: profileError } = await supabase.from('ops_profiles').select('role,active').eq('id', uid).maybeSingle()
    if (profileError) return setError(profileError.message)
    const nextRole = me?.active ? me.role : null
    setRole(nextRole)
    if (!['owner', 'manager'].includes(nextRole)) return
    const { data, error: statusError } = await supabase.rpc('ops_sheet_sync_status')
    if (statusError) return setError(statusError.message)
    setStatus(data)
    if (nextRole === 'owner') setUrl(data?.webhook_url || '')
  }

  const saveSecret = async () => {
    if (!setupSecret) return setError('Generate a setup secret first.')
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await supabase.rpc('ops_set_google_sheets_shared_secret', { p_secret: setupSecret })
    setBusy(false)
    if (saveError) return setError(saveError.message)
    setMessage('Shared secret saved in Supabase. Copy the same value into Apps Script → Project Settings → Script properties as SWIFTSUPPLY_SHARED_SECRET.')
    await load()
  }

  const saveEndpoint = async () => {
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await supabase.rpc('ops_set_google_sheets_webhook', { p_url: url })
    if (saveError) { setBusy(false); return setError(saveError.message) }
    const { data, error: invokeError } = await supabase.functions.invoke('sync-google-sheets', { body: { drain: true } })
    setBusy(false)
    if (invokeError) return setError(invokeError.message || 'Sync failed.')
    if (data?.ok === false) return setError(data.message || data.error || 'Sync failed.')
    setMessage(`Saved. Synced ${Number(data?.synced || 0)} queued item(s).`)
    await load()
  }

  const syncNow = async () => {
    setBusy(true); setError(''); setMessage('')
    const { data, error: invokeError } = await supabase.functions.invoke('sync-google-sheets', { body: { drain: true } })
    setBusy(false)
    if (invokeError) return setError(invokeError.message || 'Sync failed.')
    if (data?.ok === false) return setError(data.message || data.error || 'Sync failed.')
    setMessage(`Synced ${Number(data?.synced || 0)} queued item(s).`)
    await load()
  }

  const copySecret = async () => {
    if (!setupSecret) return
    try { await navigator.clipboard.writeText(setupSecret); setMessage('Setup secret copied.') }
    catch { setError('Could not copy automatically. Select the secret and copy it manually.') }
  }

  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!onSettings) { setSlot(null); return }
    let tries = 0
    const timer = setInterval(() => {
      const main = document.querySelector('.main')
      const header = main?.querySelector('.topbar')
      if (!main || !header) { if (++tries > 40) clearInterval(timer); return }
      let node = document.getElementById('sheet-sync-status-slot')
      if (!node) {
        node = document.createElement('div')
        node.id = 'sheet-sync-status-slot'
        header.insertAdjacentElement('afterend', node)
      }
      setSlot(node)
      clearInterval(timer)
    }, 50)
    return () => clearInterval(timer)
  }, [onSettings])

  useEffect(() => { if (onSettings) load() }, [onSettings])

  if (!onSettings || !slot || !canView) return null

  return createPortal(
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sectionhead">
        <div>
          <h2 style={{ marginBottom: 4 }}>Google Sheets sync status</h2>
          <div className="small muted">This checks the real Supabase → Apps Script → Google Sheets path.</div>
        </div>
        <span className={`pill ${status?.configured ? 'active' : 'pending'}`}>
          {status?.configured ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {stateLabel}
        </span>
      </div>

      <div className="grid threecol" style={{ marginTop: 14 }}>
        <div className="metric"><div className="label">Pending</div><div className="value">{status?.pending ?? '—'}</div></div>
        <div className="metric"><div className="label">Failed</div><div className="value">{status?.failed ?? '—'}</div></div>
        <div className="metric"><div className="label">Synced</div><div className="value">{status?.synced ?? '—'}</div></div>
      </div>

      {!status?.configured && <div className="notice" style={{ marginTop: 14 }}>
        <AlertTriangle size={17}/>
        <div>
          <strong>Automatic mirroring is not fully configured.</strong>
          <div className="small" style={{ marginTop: 4 }}>
            {status?.webhook_configured ? 'The Google endpoint is saved.' : 'The deployed Google Apps Script /exec URL is missing.'}
            {' '}
            {status?.shared_secret_configured ? 'A shared secret exists.' : 'The shared secret is missing.'}
          </div>
        </div>
      </div>}

      {status?.last_error && <div className="notice error" style={{ marginTop: 12 }}>Last sync error: {status.last_error}</div>}
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      {message && <div className="notice" style={{ marginTop: 12 }}>{message}</div>}

      {isOwner && !status?.configured && <div className="card" style={{ marginTop: 14, boxShadow: 'none' }}>
        <h3>Finish the one-time Google authorization</h3>
        <ol className="muted small" style={{ lineHeight: 1.7, paddingLeft: 20 }}>
          <li>Open Google Apps Script and create a project owned by the Google account that can edit the SwiftSupply Business Manager sheet.</li>
          <li>Paste the repository bridge code into the project.</li>
          <li>Generate a new setup secret below, save it, then put the exact same value in Apps Script → Project Settings → Script properties as <strong>SWIFTSUPPLY_SHARED_SECRET</strong>.</li>
          <li>Deploy the script as a Web app, execute as yourself, allow access, then paste the deployment URL ending in <strong>/exec</strong> below.</li>
          <li>Press Save endpoint & sync. The queued records will be drained into the workbook.</li>
        </ol>
        <div className="actions" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <a className="btn" target="_blank" rel="noreferrer" href={appsScriptHome}><ExternalLink size={15}/> Open Apps Script</a>
          <a className="btn" target="_blank" rel="noreferrer" href={bridgeCode}><ExternalLink size={15}/> Open bridge code</a>
        </div>
        <div className="formgrid">
          <div className="field span2"><label>Setup secret</label><div className="actions" style={{ alignItems: 'stretch' }}><input readOnly value={setupSecret} placeholder="Generate a new secret"/><button className="btn" type="button" onClick={()=>setSetupSecret(makeSecret())}>Generate</button><button className="btn" type="button" disabled={!setupSecret} onClick={copySecret}><Copy size={15}/> Copy</button><button className="btn" type="button" disabled={!setupSecret||busy} onClick={saveSecret}>Save secret</button></div></div>
          <div className="field span2"><label>Apps Script Web App /exec URL</label><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec"/></div>
        </div>
        <button className="btn primary" type="button" disabled={busy||!url} onClick={saveEndpoint} style={{ marginTop: 12 }}><RefreshCw size={15}/> {busy ? 'Working…' : 'Save endpoint & sync'}</button>
      </div>}

      {status?.configured && <div className="actions" style={{ marginTop: 14 }}><button className="btn primary" onClick={syncNow} disabled={busy}><RefreshCw size={15}/> {busy ? 'Syncing…' : 'Sync now'}</button></div>}
    </div>,
    slot
  )
}
