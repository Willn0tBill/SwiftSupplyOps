import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import QuoteCalculator from './QuoteCalculator'
import StaffRequests from './StaffRequests'
import './styles.css'
import './mobile-safe-area.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /><StaffRequests /><QuoteCalculator /></React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
