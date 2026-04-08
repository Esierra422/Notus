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

const RAW_AI_HTTP = (import.meta.env.VITE_AI_HTTP_URL || '').replace(/\/$/, '')
const RAW_AI_WS = (import.meta.env.VITE_AI_WS_URL || '').replace(/\/$/, '')

/**
 * HTTP(S) base for FastAPI ai-backend only (/api/ask, /api/generate-summary).
 * Do not fall back to VITE_API_URL (Express): those routes are not on the Node server.
 * VITE_AI_WS_URL is often wss://… — fetch() cannot use that scheme, so map to http(s).
 * Prefer VITE_AI_HTTP_URL when WS and HTTP differ.
 */
export function getAiRestHttpBase() {
  if (RAW_AI_HTTP) return RAW_AI_HTTP
  if (!RAW_AI_WS) return ''
  if (RAW_AI_WS.startsWith('wss://')) return `https://${RAW_AI_WS.slice(6)}`
  if (RAW_AI_WS.startsWith('ws://')) return `http://${RAW_AI_WS.slice(5)}`
  if (RAW_AI_WS.startsWith('https://') || RAW_AI_WS.startsWith('http://')) return RAW_AI_WS
  return ''
}
