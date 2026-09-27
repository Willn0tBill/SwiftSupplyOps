import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

const cleanName = p => {
  const name = String(p?.full_name || '').trim()
  const email = String(p?.email || '').trim()
  return name && name.toLowerCase() !== email.toLowerCase() ? name : ''
}

function rowsForHeading(heading) {
  const cards = [...document.querySelectorAll('.card')]
  const card = cards.find(c => c.querySelector('.sectionhead h2')?.textContent?.trim() === heading)
  if (!card) return []
  const list = card.querySelector('.list')
  if (!list) return []
  return [...list.children].filter(el => el.classList?.contains('rowcard'))
}

export default function EmployeeContactEnhancer() {
  const [profiles, setProfiles] = useState([])
  const [userId, setUserId] = useState(null)
  const [, setScanVersion] = useState(0)
  const [page, setPage] = useState(() => location.hash)
  const [editingPerson, setEditingPerson] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = async () => {
    const [{ data: profileRows }, { data: authData }] = await Promise.all([
      supabase.from('ops_profiles').select('*').order('full_name'),
      supabase.auth.getUser()
    ])
    setProfiles(profileRows || [])
    setUserId(authData?.user?.id || null)
  }

  useEffect(() => {
    const onHash = () => setPage(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!page.includes('#/employees')) return
    load()
  }, [page])

  useEffect(() => {
    if (!page.includes('#/employees')) return
    setScanVersion(v => v + 1)
    const timer = setInterval(() => setScanVersion(v => v + 1), 500)
    return () => clearInterval(timer)
  }, [page])

  const active = useMemo(() => profiles.filter(p => p.active), [profiles])
  const pending = useMemo(() => profiles.filter(p => !p.active && p.role === 'pending' && p.access_requested_at), [profiles])
  const current = profiles.find(p => p.id === userId)
  const isOwner = current?.role === 'owner' && current?.active

  const openNameEditor = person => {
    setEditingPerson(person)
    setNameInput(cleanName(person))
    setSaveError('')
  }

  const closeNameEditor = () => {
    if (saveBusy) return
    setEditingPerson(null)
    setNameInput('')
    setSaveError('')
  }

  const saveName = async e => {
    e.preventDefault()
    if (!editingPerson) return
    const name = nameInput.trim()
    if (!name) {
      setSaveError('Enter a name first.')
      return
    }

    setSaveBusy(true)
    setSaveError('')
    const { error } = await supabase.rpc('ops_set_staff_name', {
      p_user_id: editingPerson.id,
      p_full_name: name
    })

    if (error) {
      setSaveError(error.message)
      setSaveBusy(false)
      return
    }

    await load()
    setSaveBusy(false)
    setEditingPerson(null)
    setNameInput('')
    setTimeout(() => setScanVersion(v => v + 1), 0)
  }

  if (!page.includes('#/employees')) return null

  const portals = []
  const activeRows = rowsForHeading('Team')
  active.forEach((person, i) => {
    const target = activeRows[i]?.firstElementChild
    if (!target) return
    const hasName = Boolean(cleanName(person))
    portals.push(createPortal(
      <div className="meta" style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:3}}>
        <span>{person.email || 'No email saved'}</span>
        {isOwner && <button type="button" className="btn sm" onClick={() => openNameEditor(person)}>{hasName ? 'Edit name' : 'Set name'}</button>}
      </div>,
      target,
      `active-email-${person.id}`
    ))
  })

  const pendingRows = rowsForHeading('Pending access requests')
  pending.forEach((person, i) => {
    const target = pendingRows[i]?.firstElementChild
    if (!target) return
    portals.push(createPortal(
      <div className="meta" style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:3}}>
        <span>{person.email || 'No email saved'}</span>
        {isOwner && <button type="button" className="btn sm" onClick={() => openNameEditor(person)}>{cleanName(person) ? 'Edit name' : 'Set name'}</button>}
      </div>,
      target,
      `pending-email-${person.id}`
    ))
  })

  if (editingPerson) {
    portals.push(createPortal(
      <div className="modalback" onMouseDown={e => e.target === e.currentTarget && closeNameEditor()}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="employee-name-title">
          <div className="modalhead">
            <div>
              <h2 id="employee-name-title">{cleanName(editingPerson) ? 'Edit employee name' : 'Set employee name'}</h2>
              <div className="muted small">{editingPerson.email || 'No email saved'}</div>
            </div>
            <button type="button" className="iconbtn" onClick={closeNameEditor} disabled={saveBusy}>×</button>
          </div>
          <form onSubmit={saveName}>
            <div className="field">
              <label>Full name</label>
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="Employee name"
                disabled={saveBusy}
              />
            </div>
            {saveError && <div className="notice error">{saveError}</div>}
            <div className="actions" style={{marginTop:16, justifyContent:'flex-end'}}>
              <button type="button" className="btn" onClick={closeNameEditor} disabled={saveBusy}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saveBusy}>{saveBusy ? 'Saving…' : 'Save name'}</button>
            </div>
          </form>
        </div>
      </div>,
      document.body,
      'employee-name-modal'
    ))
  }

  return <>{portals}</>
}
