import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'

const POSITION_OPTIONS = [
  'Founder / Owner / President',
  'General Manager',
  'Operations Manager',
  'Finance / Bookkeeping Manager',
  'Sales Manager',
  'Marketing / Social Media Manager',
  'Customer Service Representative',
  'SSPW Manager',
  'SSPW Crew Lead',
  'SSPW Technician',
  'Vending Operations Manager',
  'Vending Route Operator',
  'Vending Maintenance Technician',
  'Inventory / Purchasing Coordinator',
  'PSSS Sales Representative',
  'Business Development Representative',
  'HR / Staff Coordinator',
  'Intern'
]

const prettyRole = role => ({ owner: 'Owner', manager: 'Manager', employee: 'Employee', intern: 'Intern', pending: 'Pending' }[role] || role)

export default function StaffPositions() {
  const [hash, setHash] = useState(location.hash)
  const [slot, setSlot] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [saving, setSaving] = useState(null)
  const onEmployeesPage = hash.replace('#/', '') === 'employees'

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
      .select('id,full_name,role,active,job_title,deactivated_at')
      .eq('active', true)
      .order('role')
      .order('full_name')

    if (!error) setProfiles(data || [])
  }

  const setPosition = async (person, jobTitle) => {
    if (person.role === 'owner') return
    setSaving(person.id)
    const { error } = await supabase.rpc('ops_set_job_title', {
      p_user_id: person.id,
      p_job_title: jobTitle
    })
    setSaving(null)
    if (error) return alert(error.message)
    setProfiles(current => current.map(p => p.id === person.id ? { ...p, job_title: jobTitle } : p))
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
      const requests = document.getElementById('staff-requests-slot')
      const header = main?.querySelector('.topbar')
      if (!main || !header) {
        tries += 1
        if (tries > 30) clearInterval(timer)
        return
      }

      let node = document.getElementById('staff-positions-slot')
      if (!node) {
        node = document.createElement('div')
        node.id = 'staff-positions-slot'
        if (requests) requests.insertAdjacentElement('afterend', node)
        else header.insertAdjacentElement('afterend', node)
      }
      setSlot(node)
      clearInterval(timer)
    }, 50)

    return () => clearInterval(timer)
  }, [onEmployeesPage])

  useEffect(() => {
    if (onEmployeesPage) load()
  }, [onEmployeesPage])

  if (!onEmployeesPage || !slot || !isOwner) return null

  return createPortal(
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="sectionhead">
        <div>
          <h2 style={{ marginBottom: 4 }}>Team Positions</h2>
          <div className="small muted">Job position is separate from app access. Access controls what they can do; position describes their actual job.</div>
        </div>
        <span className="pill active">{profiles.length} active</span>
      </div>
      <div className="list">
        {profiles.length ? profiles.map(person => (
          <div className="rowcard" key={person.id}>
            <div style={{ minWidth: 0 }}>
              <div className="title">{person.full_name || 'Staff user'}</div>
              <div className="meta">Access: {prettyRole(person.role)}</div>
            </div>
            <div className="actions" style={{ minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {person.role === 'owner' ? (
                <span className="pill owner">Founder / Owner / President</span>
              ) : (
                <select
                  className="btn"
                  value={person.job_title || (person.role === 'intern' ? 'Intern' : 'Customer Service Representative')}
                  onChange={e => setPosition(person, e.target.value)}
                  disabled={saving === person.id}
                  title="Company position"
                  style={{ maxWidth: 290 }}
                >
                  {POSITION_OPTIONS.filter(position => position !== 'Founder / Owner / President').map(position => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )) : <div className="empty">No active staff yet.</div>}
      </div>
    </div>,
    slot
  )
}
