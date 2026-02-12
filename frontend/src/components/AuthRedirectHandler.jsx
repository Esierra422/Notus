/**
 * Handles Firebase Auth redirect result after signInWithRedirect.
 * Call getRedirectResult() once on app load so Safari (and other redirect-based) sign-in works.
 * Shows "Signing you in..." overlay on return so users don't think login failed.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getRedirectResult } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { ensureUserDoc, getUserDoc } from '../lib/userService'
import '../styles/variables.css'
import '../pages/AppLayout.css'

function SigningInOverlay() {
  return (
    <div
      className="app-layout app-layout-auth-loading"
      style={{ background: '#0a0908', color: '#9a9489', minHeight: '100vh' }}
      role="status"
      aria-live="polite"
    >
      <div className="app-auth-loading" aria-label="Signing in">
        <div className="app-auth-loading-spinner" style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }} />
        <p style={{ color: '#9a9489' }}>Signing you in…</p>
      </div>
    </div>
  )
}

export function AuthRedirectHandler({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasRun = useRef(false)
  const [isResumingRedirect, setIsResumingRedirect] = useState(() =>
    typeof window !== 'undefined' &&
    ['/login', '/signup'].includes(window.location.pathname) &&
    sessionStorage.getItem('auth_redirect_pending') === 'google'
  )

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    getRedirectResult(auth)
      .then(async (result) => {
        if (!result?.user) return

        await ensureUserDoc(result.user, ['google'])
        const doc = await getUserDoc(result.user.uid)

        if (doc?.onboardingComplete) {
          navigate('/app', { replace: true })
          return
        }

        const state = { fromRedirect: true, provider: 'google' }
        const returnPath = location.pathname === '/signup' ? '/signup' : '/login'
        navigate(returnPath, { replace: true, state })
      })
      .catch((err) => {
        console.error('Redirect sign-in error:', err)
      })
      .finally(() => {
        sessionStorage.removeItem('auth_redirect_pending')
        setIsResumingRedirect(false)
      })
  }, [navigate, location.pathname])

  if (isResumingRedirect) {
    return <SigningInOverlay />
  }

  return children
}
