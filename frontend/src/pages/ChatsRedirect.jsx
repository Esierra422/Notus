/**
 * Handles /app/chats - redirects to org-scoped chats or shows org picker when multiple orgs.
 */
import { useState, useEffect } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { getActiveMemberships } from '../lib/orgService'
import { getOrg } from '../lib/orgService'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './OrgPage.css'

export function ChatsRedirect() {
  const { user, setNavExtra } = useOutletContext() || {}
  const [orgs, setOrgs] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (setNavExtra && ready && orgs.length === 0) setNavExtra(null)
  }, [setNavExtra, ready, orgs.length])

  useEffect(() => {
    if (!user) return
    getActiveMemberships(user.uid).then(async (memberships) => {
      const orgList = await Promise.all(
        memberships.map((m) => getOrg(m.orgId).then((o) => o ? { id: o.id, name: o.name } : null))
      )
      setOrgs(orgList.filter(Boolean))
      setReady(true)
    })
  }, [user])

  if (!user || !ready) {
    return (
      <main className="app-main app-main-center">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  if (orgs.length === 0) {
    return (
      <main className="app-main">
        <h2>Chats</h2>
        <p className="app-muted">Create or join an organization to use chats.</p>
        <Button to="/app" variant="primary" size="md">Go to Dashboard</Button>
      </main>
    )
  }

  return <Navigate to={`/app/org/${orgs[0].id}/chats`} replace />
}
