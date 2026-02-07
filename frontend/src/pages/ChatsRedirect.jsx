/**
 * Handles /app/chats - redirects to org-scoped chats or shows no-org message.
 * Keeps redirect logic separate to avoid glitchy loading states in ChatsPage.
 */
import { useState, useEffect } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { getActiveMembership } from '../lib/orgService'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'

export function ChatsRedirect() {
  const { user, setNavExtra } = useOutletContext() || {}
  const [orgId, setOrgId] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Only clear when showing "no org" — don't clear during redirect (avoids flash)
    if (setNavExtra && ready && !orgId) setNavExtra(null)
  }, [setNavExtra, ready, orgId])

  useEffect(() => {
    if (!user) return
    getActiveMembership(user.uid).then((active) => {
      setOrgId(active?.orgId ?? null)
      setReady(true)
    })
  }, [user])

  // Redirect to org-scoped chats when we have an org
  if (ready && orgId) {
    return <Navigate to={`/app/org/${orgId}/chats`} replace />
  }

  if (!user) {
    return (
      <main className="app-main app-main-center">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  // No org - show message
  if (!ready) {
    return (
      <main className="app-main app-main-center">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  return (
    <main className="app-main">
      <h2>Chats</h2>
      <p className="app-muted">Create or join an organization to use chats.</p>
      <Button to="/app" variant="primary" size="md">Go to Dashboard</Button>
    </main>
  )
}
