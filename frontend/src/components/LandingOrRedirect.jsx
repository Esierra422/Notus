import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { LandingPage } from '../pages'
import '../pages/AppLayout.css'

/**
 * Renders the landing page at "/" when the user is signed out.
 * Redirects to /app (dashboard) when the user is signed in.
 */
export function LandingOrRedirect() {
  const [user, setUser] = useState(undefined)
  const [authReady, setAuthReady] = useState(false)
  const [showSlowHint, setShowSlowHint] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null)
      setAuthReady(true)
    })
    return unsub
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setShowSlowHint(true), 5000)
    return () => clearTimeout(t)
  }, [])

  if (!authReady) {
    return (
      <div
        style={{ background: '#0a0908', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        role="status"
        aria-live="polite"
      >
        <div className="app-auth-loading" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <div className="app-auth-loading-spinner" />
          <p style={{ color: '#9a9489', margin: 0 }}>Loading…</p>
          {showSlowHint && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
              Taking longer than usual. <a href="/" style={{ color: 'var(--accent)' }}>Try refreshing</a>.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/app" replace />
  }

  return <LandingPage />
}
