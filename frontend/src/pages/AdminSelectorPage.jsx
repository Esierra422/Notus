/**
 * Admin selector — lists orgs user can administer.
 * Click an org to go to its admin page.
 */
import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  getActiveMemberships,
  getOrg,
  getOrgMembers,
  getPendingRequests,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import { getOrgTeams } from '../lib/teamService'
import { BuildingIcon, ArrowLeftIcon, SettingsIcon, InfoIcon } from '../components/ui/Icons'
import { OrgProfileModal } from '../components/org/OrgProfileModal'
import '../styles/variables.css'
import './AppLayout.css'
import './Dashboard.css'
import './OrgPage.css'
import './DashboardOrg.css'

export function AdminSelectorPage() {
  const { user, setNavExtra } = useOutletContext() || {}
  const [adminOrgs, setAdminOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgStats, setOrgStats] = useState({})
  const [profileModalOrgId, setProfileModalOrgId] = useState(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const memberships = await getActiveMemberships(user.uid)
      const admins = memberships.filter((m) => canManageOrg(m))
      const orgList = await Promise.all(
        admins.map(async (m) => {
          const orgData = await getOrg(m.orgId)
          return orgData ? { orgId: m.orgId, org: orgData, membership: m } : null
        })
      )
      setAdminOrgs(orgList.filter(Boolean))
      setLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    if (!user?.uid || adminOrgs.length === 0) return
    const load = async () => {
      const stats = {}
      for (const { orgId } of adminOrgs) {
        const [members, teams, pending] = await Promise.all([
          getOrgMembers(orgId),
          getOrgTeams(orgId),
          getPendingRequests(orgId),
        ])
        stats[orgId] = {
          members: members.filter((m) => m.state === MEMBERSHIP_STATES.active).length,
          teams: teams.length,
          pending: pending.length,
        }
      }
      setOrgStats(stats)
    }
    load()
  }, [user?.uid, adminOrgs])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  if (!user) return null

  if (loading) {
    return (
      <main className="app-main dashboard-main">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  if (adminOrgs.length === 0) {
    return (
      <main className="app-main dashboard-main">
        <Link to="/app" className="page-back-btn">
          <ArrowLeftIcon size={18} /> Back to dashboard
        </Link>
        <h2>Admin</h2>
        <p className="app-muted">You are not an admin of any organization.</p>
      </main>
    )
  }

  return (
    <main className="app-main dashboard-main">
      <Link to="/app" className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back to dashboard
      </Link>

      <div className="org-selector-header" style={{ marginBottom: '1.5rem' }}>
        <h2>Admin</h2>
      </div>

      <p className="app-muted" style={{ marginBottom: '1.5rem' }}>
        Select an organization to manage members, teams, and invites.
      </p>

      <div className="dashboard-shortcuts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {adminOrgs.map(({ orgId, org }) => (
          <div key={orgId} className="dashboard-shortcut-wrapper">
            <Link to={`/app/org/${orgId}/admin`} className="dashboard-shortcut">
              <span className="dashboard-shortcut-icon">
                {org.imageUrl ? (
                  <img src={org.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <SettingsIcon size={24} />
                )}
              </span>
              <span className="dashboard-shortcut-label">{org.name}</span>
              <span className="dashboard-shortcut-hint">
                {orgStats[orgId]
                  ? `${orgStats[orgId].members} members · ${orgStats[orgId].teams} teams${orgStats[orgId].pending > 0 ? ` · ${orgStats[orgId].pending} pending` : ''}`
                  : 'Manage organization'}
              </span>
            </Link>
            <button
              type="button"
              className="dashboard-shortcut-info-btn"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setProfileModalOrgId(orgId)
              }}
              aria-label="View organization profile"
              title="View organization profile"
            >
              <InfoIcon size={16} />
            </button>
          </div>
        ))}
      </div>

      {profileModalOrgId && (
        <OrgProfileModal
          orgId={profileModalOrgId}
          userId={user?.uid}
          onClose={() => setProfileModalOrgId(null)}
        />
      )}
    </main>
  )
}
