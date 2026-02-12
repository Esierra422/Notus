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
import { getActiveMembership, getOrg, getMembership, canManageOrg } from '../lib/orgService'
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

  useEffect(() => {
    const handler = () => user?.uid && getUserDoc(user.uid).then(setUserDoc)
    window.addEventListener(PROFILE_UPDATED_EVENT, handler)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler)
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    getActiveMembership(user.uid).then(async (active) => {
      if (!active?.orgId) {
        setActiveOrg(null)
        setIsAdmin(false)
        lastOrgRef.current = null
        return
      }
      const [org, membership] = await Promise.all([
        getOrg(active.orgId),
        getMembership(active.orgId, user.uid),
      ])
      setActiveOrg(org)
      setIsAdmin(!!canManageOrg(membership))
      if (org?.name) lastOrgRef.current = org.name
    })
  }, [user?.uid])

  const displayedOrg = activeOrg ?? (lastOrgRef.current ? { name: lastOrgRef.current } : null)
  const activeOrgId = activeOrg?.id ?? null

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
            <p style={{ color: '#9a9489', fontSize: '0.9rem', marginTop: '1rem' }}>
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
      <div className={`app-layout ${isChatsPage ? 'app-layout-chats' : ''}`}>
        <AppHeader user={user} orgName={displayedOrg?.name} activeOrgId={activeOrgId} isAdmin={isAdmin} navExtraOverride={navExtraOverride} />
        <PageTransition>
          <Outlet context={{ user, userDoc, setNavExtra: setNavExtraOverride }} />
        </PageTransition>
        {!isChatsPage && <AppFooter />}
      </div>
    </NavExtraContext.Provider>
  )
}
