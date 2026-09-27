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
  const [scanVersion, setScanVersion] = useState(0)
  const [page, setPage] = useState(() => location.hash)

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
    const observer = new MutationObserver(() => setScanVersion(v => v + 1))
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = setTimeout(() => setScanVersion(v => v + 1), 50)
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [page])

  const active = useMemo(() => profiles.filter(p => p.active), [profiles])
  const pending = useMemo(() => profiles.filter(p => !p.active && p.role === 'pending' && p.access_requested_at), [profiles])
  const current = profiles.find(p => p.id === userId)
  const isOwner = current?.role === 'owner' && current?.active

  const setName = async person => {
    const next = window.prompt('Employee name', cleanName(person))
    if (next === null) return
    const name = next.trim()
    if (!name) {
      window.alert('Enter a name first.')
      return
    }
    const { error } = await supabase.rpc('ops_set_staff_name', { p_user_id: person.id, p_full_name: name })
    if (error) {
      window.alert(error.message)
      return
    }
    await load()
    window.location.reload()
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
        {isOwner && !hasName && <button type="button" className="btn sm" onClick={() => setName(person)}>Set name</button>}
        {isOwner && hasName && <button type="button" className="btn sm" onClick={() => setName(person)}>Edit name</button>}
      </div>,
      target,
      `active-email-${person.id}-${scanVersion}`
    ))
  })

  const pendingRows = rowsForHeading('Pending access requests')
  pending.forEach((person, i) => {
    const target = pendingRows[i]?.firstElementChild
    if (!target) return
    portals.push(createPortal(
      <div className="meta" style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:3}}>
        <span>{person.email || 'No email saved'}</span>
        {isOwner && <button type="button" className="btn sm" onClick={() => setName(person)}>{cleanName(person) ? 'Edit name' : 'Set name'}</button>}
      </div>,
      target,
      `pending-email-${person.id}-${scanVersion}`
    ))
  })

  return <>{portals}</>
}
