import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { LandingPage } from '../pages'

/**
 * Renders the landing page at "/" when the user is signed out.
 * Redirects to /app (dashboard) when the user is signed in.
 */
export function LandingOrRedirect() {
  const [user, setUser] = useState(undefined)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null)
      setAuthReady(true)
    })
    return unsub
  }, [])

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0a0908',
        }}
        aria-label="Loading"
      />
    )
  }

  if (user) {
    return <Navigate to="/app" replace />
  }

  return <LandingPage />
}
