/**
 * Organizations selector: lists all orgs the user belongs to.
 * Click an org to go to its dashboard. Add new organization opens a modal.
 */
import { useState, useEffect } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { Link, useOutletContext } from 'react-router-dom'
import {
  getActiveMemberships,
  getPendingMembership,
  getOrg,
  getOrgMembers,
  createOrg,
  searchOrgsByName,
  requestToJoinOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import { getOrgTeams } from '../lib/teamService'
import { Button } from '../components/ui/Button'
import { BuildingIcon, ArrowLeftIcon, PlusIcon, XIcon, InfoIcon } from '../components/ui/Icons'
import { OrgProfileModal } from '../components/org/OrgProfileModal'
import '../styles/variables.css'
import './AppLayout.css'
import './Dashboard.css'
import './OrgPage.css'
import './DashboardOrg.css'

export function OrganizationsPage() {
  const { user, setNavExtra } = useOutletContext() || {}
  const [orgs, setOrgs] = useState([])
  const [pendingOrg, setPendingOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [profileModalOrgId, setProfileModalOrgId] = useState(null)
  const [orgName, setOrgName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [error, setError] = useState('')
  const [orgStats, setOrgStats] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [joinLoading, setJoinLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  useScrollLock(showCreateModal)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [memberships, pendingMem] = await Promise.all([
        getActiveMemberships(user.uid),
        getPendingMembership(user.uid),
      ])
      const orgList = await Promise.all(
        memberships.map(async (m) => {
          const orgData = await getOrg(m.orgId)
          return orgData ? { orgId: m.orgId, org: orgData, membership: m } : null
        })
      )
      setOrgs(orgList.filter(Boolean))
      if (pendingMem) {
        const orgData = await getOrg(pendingMem.orgId)
        setPendingOrg(orgData || { id: pendingMem.orgId, name: 'Organization' })
      }
      setLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    if (!user?.uid || orgs.length === 0) return
    const load = async () => {
      const stats = {}
      for (const { orgId } of orgs) {
        const [members, teams] = await Promise.all([
          getOrgMembers(orgId),
          getOrgTeams(orgId),
        ])
        stats[orgId] = {
          members: members.filter((m) => m.state === MEMBERSHIP_STATES.active).length,
          teams: teams.length,
        }
      }
      setOrgStats(stats)
    }
    load()
  }, [user?.uid, orgs])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  const handleCreateOrg = async (e) => {
    e.preventDefault()
    setError('')
    if (!orgName.trim()) {
      setError('Enter an organization name.')
      return
    }
    setCreateLoading(true)
    try {
      const newOrg = await createOrg(orgName.trim(), user.uid)
      setOrgs((prev) => [...prev, { orgId: newOrg.id, org: newOrg, membership: { state: MEMBERSHIP_STATES.active, role: 'owner' } }])
      setShowCreateModal(false)
      setOrgName('')
      setError('')
      setPendingOrg(null)
    } catch (err) {
      setError(err?.message || 'Failed to create organization.')
    } finally {
      setCreateLoading(false)
    }
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setOrgName('')
    setError('')
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    setSearchError('')
    setSearching(true)
    try {
      const results = await searchOrgsByName(searchTerm)
      setSearchResults(results)
    } catch (err) {
      setSearchError(err.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const handleRequestJoin = async (orgData) => {
    setSearchError('')
    setJoinLoading(true)
    try {
      await requestToJoinOrg(orgData.id, user.uid)
      setPendingOrg(orgData)
      setSearchResults([])
      setSearchTerm('')
    } catch (err) {
      setSearchError(err.message || 'Failed to send request.')
    } finally {
      setJoinLoading(false)
    }
  }

  if (!user) return null

  if (loading) {
    return (
      <main className="app-main dashboard-main">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  return (
    <main className="app-main dashboard-main">
      <Link to="/app" className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back to dashboard
      </Link>

      <div className="org-selector-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2>Organizations</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>
            <PlusIcon size={18} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
            Add new organization
          </Button>
          <Button variant="outline" size="md" onClick={() => {
            setShowSearch((v) => {
              if (v) { setSearchTerm(''); setSearchResults([]); setSearchError(''); }
              return !v
            })
          }}>
            {showSearch ? 'Cancel' : 'Request to join existing'}
          </Button>
        </div>
      </div>

      {showSearch && <div className="onboarding-org-search" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} className="onboarding-org-form">
          <input
            type="text"
            placeholder="Search for an organization to join"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="auth-input"
            disabled={searching}
          />
          <Button type="submit" variant="outline" size="md" disabled={searching}>
            {searching ? 'Searching...' : 'Search to join'}
          </Button>
        </form>
        {searchError && <p className="auth-error">{searchError}</p>}
        {searchResults.length > 0 && (
          <ul className="onboarding-org-results">
            {searchResults.map((o) => (
              <li key={o.id} className="onboarding-org-result-item">
                <span>{o.name}</span>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => handleRequestJoin(o)}
                  disabled={joinLoading}
                >
                  Request to join
                </Button>
              </li>
            ))}
          </ul>
        )}
        {searchResults.length === 0 && searchTerm && !searching && (
          <p className="app-muted" style={{ marginTop: '0.5rem' }}>No organizations found.</p>
        )}
      </div>}

      
      {!showSearch &&pendingOrg && (
        <div className="dashboard-pending" style={{ marginBottom: '1.5rem' }}>
          <p className="onboarding-org-pending-text">
            Waiting for approval to join <strong>{pendingOrg.name}</strong>
          </p>
        </div>
      )}

      {!showSearch && <div className="dashboard-shortcuts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {orgs.map(({ orgId, org }) => (
          <div key={orgId} className="dashboard-shortcut-wrapper">
            <Link to={`/app/org/${orgId}`} className="dashboard-shortcut">
              <span className="dashboard-shortcut-icon">
                {org.imageUrl ? (
                  <img src={org.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <BuildingIcon size={24} />
                )}
              </span>
              <span className="dashboard-shortcut-label">{org.name}</span>
              <span className="dashboard-shortcut-hint">
                {orgStats[orgId] ? `${orgStats[orgId].members} members · ${orgStats[orgId].teams} teams` : 'View dashboard'}
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
        {orgs.length === 0 && !pendingOrg && (
          <p className="app-muted">No organizations are available yet. Create an organization to get started.</p>
        )}
      </div>}

      {showCreateModal && (
        <div
          className="org-create-overlay"
          onClick={() => !createLoading && closeCreateModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="org-create-title"
        >
          <div className="org-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="org-create-modal-header">
              <h3 id="org-create-title">Add new organization</h3>
              <button
                type="button"
                className="org-create-modal-close"
                onClick={closeCreateModal}
                disabled={createLoading}
                aria-label="Close"
              >
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateOrg} className="org-create-modal-body">
              <input
                type="text"
                placeholder="Organization name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="auth-input"
                disabled={createLoading}
                autoFocus
              />
              {error && <p className="auth-error">{error}</p>}
              <div className="org-create-modal-actions">
                <Button type="button" variant="ghost" onClick={closeCreateModal} disabled={createLoading}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="lg" disabled={createLoading}>
                  {createLoading ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
