/**
 * Persistent app layout: header + content + footer.
 * Header stays mounted across Dashboard/Calendar/Chats/etc. navigation,
 * eliminating glitching caused by remounting on every route change.
 * AppShell owns the org badge so it never flashes during navigation.
 */
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getUserDoc } from '../lib/userService'
import { getActiveMemberships, getOrg, getMembership, canManageOrg } from '../lib/orgService'
import { registerForPush, onForegroundMessage } from '../lib/messagingService'
import { AppHeader, AppFooter, PROFILE_UPDATED_EVENT } from './app'
import { PageTransition } from './PageTransition'
import '../styles/variables.css'
import '../pages/AppLayout.css'

const NavExtraContext = createContext(null)

export function useSetNavExtra() {
  return useContext(NavExtraContext)
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const isChatsPage = /\/org\/[^/]+\/chats/.test(location.pathname)
  /** Full-height video shell (lobby + in-call only). Past meetings uses normal scroll layout. */
  const isVideoImmersiveLayout =
    location.pathname === '/app/video' || /^\/app\/org\/[^/]+\/video$/.test(location.pathname)
  const [activeOrg, setActiveOrg] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [navExtraOverride, setNavExtraOverride] = useState(undefined)
  const [slowLoad, setSlowLoad] = useState(false)
  const lastOrgRef = useRef(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthReady(true)
      if (!u) {
        navigate('/login', { replace: true })
        return
      }
      setUser(u)
    })
    return unsub
  }, [navigate])

  useEffect(() => {
    if (!user?.uid) return
    getUserDoc(user.uid).then(setUserDoc)
  }, [user?.uid])

  // If user hasn't completed profile (e.g. after Google sign-in), send to signup to complete; then they return to /app
  useEffect(() => {
    if (!user || userDoc === null) return
    if (userDoc && !userDoc.onboardingComplete) {
      navigate('/signup', { replace: true, state: { fromRedirect: true, provider: 'google' } })
    }
  }, [user, userDoc, navigate])

  useEffect(() => {
    const handler = () => user?.uid && getUserDoc(user.uid).then(setUserDoc)
    window.addEventListener(PROFILE_UPDATED_EVENT, handler)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler)
  }, [user?.uid])

  // Push notifications: register FCM token when user has enabled in Settings
  useEffect(() => {
    if (!user?.uid || userDoc?.notificationsPushEnabled !== true) return
    registerForPush(user.uid).catch(() => {})
  }, [user?.uid, userDoc?.notificationsPushEnabled])

  // Foreground: show browser notification when a push is received while app is open
  useEffect(() => {
    onForegroundMessage((payload) => {
      if (Notification.permission === 'granted' && payload.notification) {
        new Notification(payload.notification.title || 'Notus', {
          body: payload.notification.body,
          icon: payload.notification.icon || '/favicon.svg',
        })
      }
    })
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    getActiveMemberships(user.uid).then(async (memberships) => {
      const admins = memberships.filter((m) => canManageOrg(m))
      setIsAdmin(admins.length > 0)
      if (memberships.length === 0) {
        setActiveOrg(null)
        lastOrgRef.current = null
        return
      }
      const match = location.pathname.match(/\/org\/([^/]+)/)
      const routeOrgId = match?.[1]
      const orgIdToLoad = routeOrgId || memberships[0].orgId
      const orgData = await getOrg(orgIdToLoad)
      setActiveOrg(orgData)
      if (orgData?.name) lastOrgRef.current = orgData.name
    })
  }, [user?.uid, location.pathname])

  const displayedOrg = activeOrg ?? (lastOrgRef.current ? { name: lastOrgRef.current } : null)
  const activeOrgId = activeOrg?.id ?? null

  const currentPageTitle = (() => {
    const p = location.pathname
    if (p === '/app' || p === '/app/') return 'Dashboard'
    if (p === '/app/calendar') return 'Calendar'
    if (p === '/app/video' || /^\/app\/org\/[^/]+\/video$/.test(p)) return 'Video Call'
    if (p.startsWith('/app/video/') && p !== '/app/video/meetings') return 'Video Call'
    if (/^\/app\/org\/[^/]+\/video\//.test(p) && !/\/video\/meetings$/.test(p)) return 'Video Call'
    if (/^\/app\/org\/[^/]+\/chats/.test(p)) return 'Chats'
    if (p === '/app/profile') return 'Profile'
    if (p === '/app/settings') return 'Settings'
    if (p === '/app/organizations') return 'Organizations'
    if (p === '/app/admin') return 'Admin'
    if (/^\/app\/org\/[^/]+$/.test(p)) return 'Organization'
    if (/^\/app\/org\/[^/]+\/profile$/.test(p)) return 'Org Profile'
    if (/^\/app\/org\/[^/]+\/admin$/.test(p)) return 'Admin'
    if (/^\/app\/org\/[^/]+\/calendar$/.test(p)) return 'Calendar'
    if (/^\/app\/org\/[^/]+\/teams\/[^/]+$/.test(p)) return 'Team'
    if (p === '/app/previous-meetings') return 'Past meetings'
    if (p === '/app/video/meetings') return 'Past meetings'
    if (/^\/app\/org\/[^/]+\/video\/meetings$/.test(p)) return 'Past meetings'
    if (/^\/app\/meeting-summary\//.test(p)) return 'Meeting Summary'
    if (/^\/app\/meeting-transcript\//.test(p)) return 'Meeting Transcript'
    if (p === '/app/features') return 'Features'
    if (p === '/app/how-it-works') return 'How it works'
    return 'Notus'
  })()

  useEffect(() => {
    if (authReady && user) return
    const t = setTimeout(() => setSlowLoad(true), 8000)
    return () => clearTimeout(t)
  }, [authReady, user])

  if (!authReady || !user) {
    return (
      <div
        className="app-layout app-layout-auth-loading"
        style={{ background: '#0a0908', color: '#9a9489', minHeight: '100vh' }}
        role="status"
        aria-live="polite"
      >
        <div className="app-auth-loading" aria-label="Loading">
          <div className="app-auth-loading-spinner" style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }} />
          <p style={{ color: '#9a9489' }}>{authReady ? 'Redirecting to login…' : 'Loading…'}</p>
          {slowLoad && (
            <p style={{ color: '#9a9489', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Taking longer than usual.{' '}
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Try refreshing
              </button>
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <NavExtraContext.Provider value={setNavExtraOverride}>
      <div
        className={`app-layout ${isChatsPage ? 'app-layout-chats' : ''} ${isVideoImmersiveLayout ? 'app-layout-video' : ''}`}
      >
        <AppHeader user={user} orgName={displayedOrg?.name} activeOrgId={activeOrgId} isAdmin={isAdmin} navExtraOverride={navExtraOverride} currentPageTitle={currentPageTitle} />
        <PageTransition>
          <Outlet context={{ user, userDoc, setNavExtra: setNavExtraOverride, activeOrgId }} />
        </PageTransition>
        {!isChatsPage && !isVideoImmersiveLayout && <AppFooter />}
      </div>
    </NavExtraContext.Provider>
  )
}
