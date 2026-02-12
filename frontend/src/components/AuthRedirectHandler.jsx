/**
 * Handles Firebase Auth redirect result after signInWithRedirect.
 * Shows "Signing you in..." only when returning from Google redirect; navigates to /app.
 * Falls back to onAuthStateChanged when getRedirectResult returns null (auth handler already processed).
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth'
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

async function processSignedInUser(user, navigate, path) {
  await ensureUserDoc(user, ['google'])
  const doc = await getUserDoc(user.uid)
  if (doc?.onboardingComplete) {
    navigate('/app', { replace: true })
    return
  }
  const state = { fromRedirect: true, provider: 'google' }
  const returnPath = path === '/signup' ? '/signup' : '/login'
  navigate(returnPath, { replace: true, state })
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
        await processSignedInUser(user, navigate, path)
      } catch (err) {
        console.error('Redirect sign-in error:', err)
        processed.current = false
      } finally {
        setShowSigningIn(false)
      }
    }

    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await handleUser(result.user)
          return
        }
        if (auth.currentUser && hadRedirectFlag) {
          await handleUser(auth.currentUser)
          return
        }
        if (!hadRedirectFlag) {
          setShowSigningIn(false)
          return
        }
        const unsub = onAuthStateChanged(auth, (user) => {
          if (user && hadRedirectFlag && !processed.current) {
            handleUser(user)
            unsub()
          }
        })
        setTimeout(() => {
          unsub()
          if (!processed.current) setShowSigningIn(false)
        }, 4000)
      })
      .catch((err) => {
        console.error('Redirect sign-in error:', err)
        setShowSigningIn(false)
      })
  }, [navigate, location.pathname])

  if (showSigningIn) {
    return <SigningInOverlay />
  }

  return children
}
