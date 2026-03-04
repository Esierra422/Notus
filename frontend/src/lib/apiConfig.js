/**
 * API base URL for backend calls. In production, never use localhost (blocked as mixed content).
 * Set VITE_API_URL in .env.production to your deployed backend (e.g. https://api.notusapp.com).
 */
const RAW_API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function isProductionOrigin() {
  if (typeof window === 'undefined') return false
  const host = window.location?.hostname
  return !!host && !/^localhost$|^127\.\d+\.\d+\.\d+$/.test(host)
}

function apiBaseIsLocalhost(base) {
  if (!base) return false
  return (
    /^https?:\/\/localhost(:\d+)?(\/|$)/i.test(base) ||
    /^https?:\/\/127\.\d+\.\d+\.\d+/.test(base)
  )
}

/** Base URL for API requests; empty when same-origin should be used. Never returns localhost when on production. */
export function getEffectiveApiBase() {
  if (isProductionOrigin() && apiBaseIsLocalhost(RAW_API_BASE)) return ''
  return RAW_API_BASE
}

/** Full URL for an API path (e.g. /api/video/token). */
export function getApiUrl(path) {
  const base = getEffectiveApiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}
