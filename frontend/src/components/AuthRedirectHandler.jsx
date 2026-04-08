/**
 * After Google `signInWithRedirect`, finish sign-in and go to /app.
 * Overlay clears when user is processed or after a timeout (slow Safari).
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { ensureUserDoc, getUserDoc } from '../lib/userService'
import '../styles/variables.css'
import '../pages/AppLayout.css'

const MAX_OVERLAY_WAIT_MS = 12000

function SigningInOverlay({ showLongWaitHint = false }) {
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
        {showLongWaitHint && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '1rem', maxWidth: '280px' }}>
            Taking longer than usual. You can try refreshing the page; you may already be signed in.
          </p>
        )}
      </div>
    </div>
  )
}

async function processSignedInUser(user, navigate) {
  await ensureUserDoc(user, ['google'])
  // /app; AppShell sends incomplete profiles to /signup
  navigate('/app', { replace: true })
}

export function AuthRedirectHandler({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasRun = useRef(false)
  const processed = useRef(false)
  const [showSigningIn, setShowSigningIn] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('auth_redirect_pending') === 'google' &&
      (window.location.pathname === '/login' || window.location.pathname === '/signup')
  })
  const [showLongWaitHint, setShowLongWaitHint] = useState(false)

  useEffect(() => {
    if (hasRun.current) return
    const path = location.pathname
    if (path !== '/login' && path !== '/signup') {
      setShowSigningIn(false)
      return
    }

    hasRun.current = true
    const hadRedirectFlag = typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect_pending') === 'google'
    if (typeof window !== 'undefined') sessionStorage.removeItem('auth_redirect_pending')

    const handleUser = async (user) => {
      if (processed.current || !user) return
      processed.current = true
      try {
        await processSignedInUser(user, navigate)
      } catch (err) {
        console.error('Redirect sign-in error:', err)
        processed.current = false
      } finally {
        setShowSigningIn(false)
      }
    }

    // Safari sometimes sets currentUser before getRedirectResult()
    if (hadRedirectFlag && auth.currentUser) {
      handleUser(auth.currentUser)
    }

    // onAuthStateChanged covers races with getRedirectResult
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user && hadRedirectFlag && !processed.current) {
        handleUser(user)
        unsubAuth()
      }
    })

    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user && !processed.current) {
          await handleUser(result.user)
          return
        }
        if (auth.currentUser && hadRedirectFlag && !processed.current) {
          await handleUser(auth.currentUser)
          return
        }
        if (!hadRedirectFlag) {
          setShowSigningIn(false)
        }
      })
      .catch((err) => {
        console.error('Redirect sign-in error:', err)
        setShowSigningIn(false)
      })

    // Hint then dismiss overlay so the page isn’t stuck behind the spinner
    const hintTimer = setTimeout(() => setShowLongWaitHint(true), 8000)
    const maxWaitTimer = setTimeout(() => {
      if (!processed.current) setShowSigningIn(false)
    }, MAX_OVERLAY_WAIT_MS)

    return () => {
      clearTimeout(hintTimer)
      clearTimeout(maxWaitTimer)
      unsubAuth()
    }
  }, [navigate, location.pathname])

  if (showSigningIn) {
    return <SigningInOverlay showLongWaitHint={showLongWaitHint} />
  }

  return children
}
