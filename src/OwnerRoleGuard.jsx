import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function OwnerRoleGuard() {
  const [hash, setHash] = useState(location.hash)
  const onEmployeesPage = hash.replace('#/', '') === 'employees'

  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!onEmployeesPage) return
    let observer
    let stopped = false

    const lockOwnerRow = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id
      if (!uid || stopped) return

      const { data: me } = await supabase
        .from('ops_profiles')
        .select('id,full_name,role,active')
        .eq('id', uid)
        .maybeSingle()

      if (!me?.active || me.role !== 'owner' || stopped) return

      const applyLock = () => {
        const rows = document.querySelectorAll('.main .rowcard')
        rows.forEach(row => {
          const text = row.textContent || ''
          if (!text.includes(me.full_name || '') || !text.includes('owner')) return
          const select = row.querySelector('select')
          if (select) {
            select.value = 'owner'
            select.disabled = true
            select.title = 'Your Owner role is locked to prevent accidental loss of admin access.'
          }
          if (!row.querySelector('.owner-lock-note')) {
            const actions = row.querySelector('.actions')
            if (actions) {
              const note = document.createElement('span')
              note.className = 'small muted owner-lock-note'
              note.textContent = 'Owner locked'
              actions.appendChild(note)
            }
          }
        })
      }

      applyLock()
      const main = document.querySelector('.main')
      if (main) {
        observer = new MutationObserver(applyLock)
        observer.observe(main, { childList: true, subtree: true })
      }
    }

    lockOwnerRow()
    return () => {
      stopped = true
      observer?.disconnect()
    }
  }, [onEmployeesPage])

  return null
}
