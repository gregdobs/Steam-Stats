import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AppProvider } from './hooks/useAppContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Register the installability service worker (see public/sw.js — it caches
// nothing). Production only: on the Vite dev server a service worker sits in
// front of HMR requests for no benefit, and stale-worker confusion during
// development is exactly the kind of ghost bug that costs an afternoon.
// Skipped inside Electron: the worker's only job is to make the browser offer
// "Install app", and the Electron build is already an installed app. Running
// one there would be a lifecycle surface with nothing to gain.
const isElectron = navigator.userAgent.includes('Electron')

if (import.meta.env.PROD && !isElectron && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a nicety — if registration fails the app itself is
      // completely unaffected, so this stays silent.
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)
