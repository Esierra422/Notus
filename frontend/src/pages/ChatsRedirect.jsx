/**
 * Handles /app/chats - redirects to org-scoped chats or shows org picker when multiple orgs.
 */
import { useState, useEffect } from 'react'
import { Navigate, Link, useOutletContext } from 'react-router-dom'
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

  if (orgs.length === 1) {
    return <Navigate to={`/app/org/${orgs[0].id}/chats`} replace />
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

  return (
    <main className="app-main">
      <h2>Chats</h2>
      <p className="app-muted">Select an organization to view its conversations.</p>
      <ul className="org-teams-list" style={{ maxWidth: '400px', marginTop: '1rem' }}>
        {orgs.map((o) => (
          <li key={o.id} className="org-team-item">
            <Link to={`/app/org/${o.id}/chats`} className="org-team-link">
              {o.name}
            </Link>
          </li>
        ))}
      </ul>
      <Button to="/app" variant="ghost" size="md" style={{ marginTop: '1rem' }}>← Back to Dashboard</Button>
    </main>
  )
}
