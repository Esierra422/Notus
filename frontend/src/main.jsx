import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/variables.css'
import './styles/index.css'
import './styles/mobile-app.css'
import App from './App.jsx'

try {
  const savedTheme = localStorage.getItem('notus_theme')
  const theme = savedTheme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme)
} catch {
  document.documentElement.setAttribute('data-theme', 'dark')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
