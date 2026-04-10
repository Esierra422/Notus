import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/index.css'
import './styles/mobile-app.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/error/ErrorBoundary'

try {
  const savedTheme = localStorage.getItem('notus_theme')
  const theme = savedTheme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme)
} catch {
  document.documentElement.setAttribute('data-theme', 'dark')
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('Notus: missing #root element')
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
