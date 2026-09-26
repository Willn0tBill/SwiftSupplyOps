import { useEffect, useState } from 'react'

export default function RoleOptionsGuard() {
  const [hash, setHash] = useState(location.hash)
  const onEmployeesPage = hash.replace('#/', '') === 'employees'

  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!onEmployeesPage) return

    const apply = () => {
      const main = document.querySelector('.main')
      if (!main) return

      main.querySelectorAll('select option[value="viewer"]').forEach(option => option.remove())

      const subtitle = main.querySelector('.topbar .muted.small')
      if (subtitle && subtitle.textContent?.includes('view-only access')) {
        subtitle.textContent = 'Owner, manager, employee, intern and pending approval'
      }
    }

    apply()
    const main = document.querySelector('.main')
    if (!main) return

    const observer = new MutationObserver(apply)
    observer.observe(main, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [onEmployeesPage])

  return null
}
