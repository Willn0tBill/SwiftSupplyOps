import React from 'react'
import ReactDOM from 'react-dom/client'
import OpsV2 from './OpsV2'
import QuoteCalculator from './QuoteCalculator'
import SheetSyncStatus from './SheetSyncStatus'
import EmployeeContactEnhancer from './EmployeeContactEnhancer'
import AccountBalanceEnhancer from './AccountBalanceEnhancer'
import './styles.css'
import './mobile-safe-area.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><OpsV2 /><QuoteCalculator /><SheetSyncStatus /><EmployeeContactEnhancer /><AccountBalanceEnhancer /></React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
