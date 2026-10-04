import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ROUTER_FUTURE } from './router-future'
import './services/firebase'
import './index.css'

// A deploy replaces the hashed chunks; a tab opened before it then fails to
// load a view it hasn't fetched yet. Reload once to pick up the new build —
// the flag (kept for the tab's lifetime) stops a reload loop if the chunk is
// genuinely unreachable; after that, ViewErrorBoundary offers a reload button.
const RELOADED_FLAG = 'tatu:chunk-reload'
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOADED_FLAG)) return
    sessionStorage.setItem(RELOADED_FLAG, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={ROUTER_FUTURE}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
