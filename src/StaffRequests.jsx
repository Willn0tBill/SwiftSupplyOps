import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

function RequestRow({ request, onDone }) {
  const [role, setRole] = useState('intern')
  const [busy, setBusy] = useState(false)

  const approve = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('ops_set_profile_role', {
      p_user_id: request.id,
      p_role: role
    })
    setBusy(false)
    if (error) return alert(error.message)
    await onDone()
  }

  const deny = async () => {
    if (!confirm(`Deny staff access for ${request.full_name || 'this account'}?`)) return
    setBusy(true)
    const { error } = await supabase.rpc('ops_deny_staff_request', {
      p_user_id: request.id
    })
    setBusy(false)
    if (error) return alert(error.message)
    await onDone()
  }

  return (
    <div className="rowcard staff-request-row">
      <div>
        <div className="title">{request.full_name || 'Staff applicant'}</div>
        <div className="meta">Requested staff access</div>
      </div>
      <div className="actions staff-request-actions">
        <select className="btn" value={role} onChange={e => setRole(e.target.value)} disabled={busy}>
          <option value="intern">Intern</option>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="viewer">Viewer</option>
        </select>
        <button className="btn sm good" onClick={approve} disabled={busy}>{busy ? 'Saving…' : 'Approve'}</button>
        <button className="btn sm danger" onClick={deny} disabled={busy}>Deny</button>
      </div>
    </div>
  )
}

export default function StaffRequests() {
  const [hash, setHash] = useState(location.hash)
  const [slot, setSlot] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const onEmployeesPage = hash.replace('#/', '') === 'employees'

  const pending = useMemo(
    () => profiles.filter(p => !p.active && p.access_requested_at),
    [profiles]
  )

  const load = async () => {
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) return

    const { data: me } = await supabase.from('ops_profiles').select('role,active').eq('id', uid).maybeSingle()
    const owner = me?.role === 'owner' && me?.active
    setIsOwner(Boolean(owner))
    if (!owner) {
      setProfiles([])
      return
    }

    const { data, error } = await supabase
      .from('ops_profiles')
      .select('id,full_name,role,active,access_requested_at,access_denied_at,deactivated_at')
      .order('access_requested_at', { ascending: false, nullsFirst: false })
    if (!error) setProfiles(data || [])
  }

  const refreshAll = async () => {
    await load()
    setTimeout(() => window.location.reload(), 150)
  }

  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!onEmployeesPage) {
      setSlot(null)
      return
    }

    let tries = 0
    const timer = setInterval(() => {
      const main = document.querySelector('.main')
      const header = main?.querySelector('.topbar')
      if (!main || !header) {
        tries += 1
        if (tries > 20) clearInterval(timer)
        return
      }

      let node = document.getElementById('staff-requests-slot')
      if (!node) {
        node = document.createElement('div')
        node.id = 'staff-requests-slot'
        header.insertAdjacentElement('afterend', node)
      }
      setSlot(node)
      clearInterval(timer)
    }, 50)

    return () => clearInterval(timer)
  }, [onEmployeesPage])

  useEffect(() => {
    if (onEmployeesPage) load()
  }, [onEmployeesPage])

  useEffect(() => {
    if (!onEmployeesPage || !pending.length) return
    const timer = setTimeout(() => {
      const cards = document.querySelectorAll('.main > .card .rowcard')
      cards.forEach(card => {
        const text = card.textContent || ''
        const duplicate = pending.some(p => p.full_name && text.includes(p.full_name) && text.includes('Pending approval'))
        if (duplicate) card.style.display = 'none'
      })
    }, 50)
    return () => clearTimeout(timer)
  }, [onEmployeesPage, pending])

  if (!onEmployeesPage || !slot || !isOwner) return null

  return createPortal(
    <div className="card staff-requests-card" style={{ marginBottom: 16 }}>
      <div className="sectionhead">
        <div>
          <h2 style={{ marginBottom: 4 }}>Staff Requests</h2>
          <div className="small muted">Approve only people you recognize as SwiftSupply staff.</div>
        </div>
        <span className="pill pending">{pending.length} pending</span>
      </div>
      <div className="list">
        {pending.length
          ? pending.map(p => <RequestRow key={p.id} request={p} onDone={refreshAll} />)
          : <div className="empty">No staff requests waiting for approval.</div>}
      </div>
    </div>,
    slot
  )
}
