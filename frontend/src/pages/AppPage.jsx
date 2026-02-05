import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import {
  getActiveMembership,
  getPendingMembership,
  createOrg,
  searchOrgsByName,
  requestToJoinOrg,
  getOrg,
  getMembership,
  getOrgMembers,
  getPendingRequests,
  updateMembershipState,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import { createOrgInvitation } from '../lib/invitationService'
import {
  getOrgTeams,
  createTeam,
  getTeamMembership,
  requestToJoinTeam,
} from '../lib/teamService'
import {
  createMeeting,
  getOrgMeetings,
  getMeetingsForUser,
  MEETING_SCOPES,
} from '../lib/meetingService'
import { getUserDoc, getDisplayName, getMemberDisplayLine, getProfilePictureUrl } from '../lib/userService'
import { AppHeader, AppFooter } from '../components/app'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './Dashboard.css'
import './DashboardOrg.css'
import './AppDashboardPage.css'
import './OrgPage.css'
import './OrgAdminPage.css'

/**
 * Unified dashboard — meetings, teams, and organization admin in one place.
 */
export function AppPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [activeOrgId, setActiveOrgId] = useState(null)
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [pendingOrg, setPendingOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('choose')
  const [orgName, setOrgName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [error, setError] = useState('')

  // Meetings
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [orgMeetings, setOrgMeetings] = useState([])
  const [showCreateMeeting, setShowCreateMeeting] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [creatingMeeting, setCreatingMeeting] = useState(false)

  // Teams
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [requesting, setRequesting] = useState({})

  // Admin
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [adminLoading, setAdminLoading] = useState({})

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/login')
        return
      }
      setUser(u)
      const [active, pendingMem] = await Promise.all([
        getActiveMembership(u.uid),
        getPendingMembership(u.uid),
      ])
      if (active) {
        setActiveOrgId(active.orgId)
      }
      if (pendingMem) {
        const orgData = await getOrg(pendingMem.orgId)
        setPendingOrg(orgData || { id: pendingMem.orgId, name: 'Organization' })
        setView('pending')
      }
      setLoading(false)
    })
    return unsub
  }, [navigate])

  useEffect(() => {
    if (!user || !activeOrgId) return
    const load = async () => {
      const [orgData, memData] = await Promise.all([
        getOrg(activeOrgId),
        getMembership(activeOrgId, user.uid),
      ])
      setOrg(orgData)
      setMembership(memData)
    }
    load()
  }, [user, activeOrgId])

  useEffect(() => {
    if (!user || !activeOrgId) return
    const load = async () => {
      const [upcoming, orgList] = await Promise.all([
        getMeetingsForUser(user.uid),
        getOrgMeetings(activeOrgId),
      ])
      setUpcomingMeetings(upcoming)
      setOrgMeetings(orgList)
    }
    load()
  }, [user, activeOrgId])

  useEffect(() => {
    if (!activeOrgId || !user) return
    const load = async () => {
      const teamsData = await getOrgTeams(activeOrgId)
      setTeams(teamsData)
      const mems = {}
      for (const team of teamsData) {
        const m = await getTeamMembership(activeOrgId, team.id, user.uid)
        if (m) mems[team.id] = m
      }
      setTeamMemberships(mems)
    }
    load()
  }, [activeOrgId, user, showCreateTeam])

  useEffect(() => {
    if (!activeOrgId) return
    const load = async () => {
      const [membersData, pendingData] = await Promise.all([
        getOrgMembers(activeOrgId),
        getPendingRequests(activeOrgId),
      ])
      setMembers(membersData.filter((m) => m.state === MEMBERSHIP_STATES.active))
      setPending(pendingData)
      const userIds = [...new Set([
        ...membersData.map((m) => m.userId),
        ...pendingData.map((p) => p.userId),
      ])]
      const profiles = {}
      await Promise.all(userIds.map(async (uid) => {
        try {
          profiles[uid] = await getUserDoc(uid)
        } catch {
          profiles[uid] = null
        }
      }))
      setUserProfiles(profiles)
    }
    load()
  }, [activeOrgId])

  const handleCreateOrg = async (e) => {
    e.preventDefault()
    setError('')
    if (!orgName.trim()) {
      setError('Enter an organization name.')
      return
    }
    setCreateLoading(true)
    try {
      const newOrg = await createOrg(orgName, user.uid)
      setActiveOrgId(newOrg.id)
      setOrg(newOrg)
      setMembership({ state: MEMBERSHIP_STATES.active, role: 'owner' })
      setView('choose')
      setOrgName('')
      setPendingOrg(null)
    } catch (err) {
      setError(err.message || 'Failed to create organization.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    setError('')
    setSearching(true)
    try {
      const results = await searchOrgsByName(searchTerm)
      setSearchResults(results)
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const handleRequestJoin = async (orgData) => {
    setError('')
    setCreateLoading(true)
    try {
      await requestToJoinOrg(orgData.id, user.uid)
      setPendingOrg(orgData)
      setView('pending')
      setSearchResults([])
      setSearchTerm('')
    } catch (err) {
      setError(err.message || 'Failed to send request.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleCreateMeeting = async (e) => {
    e.preventDefault()
    setError('')
    if (!newMeetingTitle.trim()) return
    setCreatingMeeting(true)
    try {
      await createMeeting(activeOrgId, {
        title: newMeetingTitle.trim(),
        scope: MEETING_SCOPES.org,
      }, user.uid)
      setShowCreateMeeting(false)
      setNewMeetingTitle('')
      const [upcoming, orgList] = await Promise.all([
        getMeetingsForUser(user.uid),
        getOrgMeetings(activeOrgId),
      ])
      setUpcomingMeetings(upcoming)
      setOrgMeetings(orgList)
    } catch (err) {
      setError(err.message || 'Failed to create meeting.')
    } finally {
      setCreatingMeeting(false)
    }
  }

  const handleCreateTeam = async (e) => {
    e.preventDefault()
    setError('')
    if (!newTeamName.trim()) return
    setCreateLoading(true)
    try {
      const team = await createTeam(activeOrgId, newTeamName, user.uid)
      setShowCreateTeam(false)
      setNewTeamName('')
      setTeams((t) => [...t, team])
    } catch (err) {
      setError(err.message || 'Failed to create team.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleRequestJoinTeam = async (teamId) => {
    setError('')
    setRequesting((r) => ({ ...r, [teamId]: true }))
    try {
      await requestToJoinTeam(activeOrgId, teamId, user.uid)
      const mem = await getTeamMembership(activeOrgId, teamId, user.uid)
      setTeamMemberships((m) => ({ ...m, [teamId]: mem }))
    } catch (err) {
      setError(err.message || 'Failed to send request.')
    } finally {
      setRequesting((r) => ({ ...r, [teamId]: false }))
    }
  }

  const handleApprove = async (userId) => {
    setAdminLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateMembershipState(activeOrgId, userId, MEMBERSHIP_STATES.active)
      setPending((p) => p.filter((m) => m.userId !== userId))
      setMembers((m) => [...m, { userId, role: 'member', state: MEMBERSHIP_STATES.active }])
      const profile = await getUserDoc(userId)
      setUserProfiles((p) => ({ ...p, [userId]: profile }))
    } finally {
      setAdminLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleReject = async (userId) => {
    setAdminLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateMembershipState(activeOrgId, userId, MEMBERSHIP_STATES.rejected)
      setPending((p) => p.filter((m) => m.userId !== userId))
    } finally {
      setAdminLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    const email = inviteEmail.trim()
    if (!email) {
      setInviteError('Enter an email address.')
      return
    }
    setInviteLoading(true)
    try {
      const inviterProfile = userProfiles[user.uid] || null
      const inviterLabel = getMemberDisplayLine(inviterProfile, user.uid, user, null)
      await createOrgInvitation(
        activeOrgId,
        email,
        user.uid,
        inviterLabel || getDisplayName(inviterProfile, user.uid),
        inviterProfile?.email || user.email || '',
        org?.name
      )
      setInviteSuccess(`Invitation sent to ${email}.`)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err.message || 'Failed to send invitation.')
    } finally {
      setInviteLoading(false)
    }
  }

  if (!user) return null

  const needsOrg = !activeOrgId && !pendingOrg
  const isAdmin = membership && canManageOrg(membership)

  return (
    <div className="app-layout">
      <AppHeader
        user={user}
        navExtra={org ? <span className="dashboard-org-badge">{org.name}</span> : null}
      />
      <main className="app-main dashboard-main">
        {loading ? (
          <p className="app-muted">Loading…</p>
        ) : needsOrg ? (
          <div className="dashboard-org-section">
            <h2>Organization</h2>
            <p className="app-muted">Create a new organization or request to join an existing one.</p>
            {view === 'choose' && (
              <div className="onboarding-org-choose">
                <div className="onboarding-org-actions">
                  <Button variant="primary" size="lg" onClick={() => setView('create')}>
                    Create organization
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => setView('search')}>
                    Request to join
                  </Button>
                </div>
              </div>
            )}
            {view === 'create' && (
              <form onSubmit={handleCreateOrg} className="onboarding-org-form">
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
                <div className="onboarding-org-form-actions">
                  <Button type="submit" variant="primary" size="lg" disabled={createLoading}>
                    {createLoading ? 'Creating...' : 'Create'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => { setView('choose'); setError(''); setOrgName(''); }}>
                    ← Back
                  </Button>
                </div>
              </form>
            )}
            {view === 'search' && (
              <div className="onboarding-org-search">
                <form onSubmit={handleSearch} className="onboarding-org-form">
                  <input
                    type="text"
                    placeholder="Search by organization name"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="auth-input"
                    disabled={searching}
                  />
                  <Button type="submit" variant="outline" size="lg" disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </Button>
                </form>
                <Button variant="ghost" onClick={() => { setView('choose'); setError(''); setSearchTerm(''); setSearchResults([]); }} className="onboarding-org-back">
                  ← Back
                </Button>
                {error && <p className="auth-error">{error}</p>}
                <ul className="onboarding-org-results">
                  {searchResults.map((o) => (
                    <li key={o.id} className="onboarding-org-result-item">
                      <span>{o.name}</span>
                      <Button variant="outline" size="md" onClick={() => handleRequestJoin(o)} disabled={createLoading}>
                        Request to join
                      </Button>
                    </li>
                  ))}
                  {searchResults.length === 0 && searchTerm && !searching && (
                    <li className="onboarding-org-no-results">No organizations found.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : view === 'pending' && pendingOrg ? (
          <div className="dashboard-pending">
            <h2>Waiting for approval</h2>
            <p className="onboarding-org-pending-text">
              Your request to join <strong>{pendingOrg.name}</strong> has been sent. An admin will review it shortly.
            </p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {/* Upcoming meetings */}
            <section className="dashboard-section">
              <h3 className="dashboard-section-title">Upcoming meetings</h3>
              <p className="dashboard-section-desc">Meetings you can access across all organizations.</p>
              {upcomingMeetings.length === 0 ? (
                <p className="app-muted">No meetings yet.</p>
              ) : (
                <ul className="meeting-list">
                  {upcomingMeetings.map((m) => (
                    <li key={m.id} className="meeting-item">
                      <span className="meeting-title">{m.title}</span>
                      <span className="meeting-meta">
                        {m._orgName || m.orgId} · {m.scope}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Org meetings */}
            <section className="dashboard-section">
              <h3 className="dashboard-section-title">Org meetings</h3>
              <p className="dashboard-section-desc">Org-scoped meetings visible to all members.</p>
              {!showCreateMeeting ? (
                <Button variant="outline" size="md" onClick={() => setShowCreateMeeting(true)} style={{ marginBottom: '1rem' }}>
                  Create meeting
                </Button>
              ) : (
                <form onSubmit={handleCreateMeeting} className="dashboard-form" style={{ marginBottom: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Meeting title"
                    value={newMeetingTitle}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    className="auth-input"
                    disabled={creatingMeeting}
                  />
                  {error && <p className="auth-error">{error}</p>}
                  <div className="dashboard-form-actions">
                    <Button type="submit" variant="primary" size="md" disabled={creatingMeeting}>
                      {creatingMeeting ? 'Creating...' : 'Create'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => { setShowCreateMeeting(false); setError(''); setNewMeetingTitle(''); }}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              {orgMeetings.length === 0 ? (
                <p className="app-muted">No org meetings yet.</p>
              ) : (
                <ul className="meeting-list">
                  {orgMeetings.map((m) => (
                    <li key={m.id} className="meeting-item">
                      <span className="meeting-title">{m.title}</span>
                      <span className="meeting-meta">{m.scope}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Teams */}
            <section className="dashboard-section">
              <h3 className="dashboard-section-title">Teams</h3>
              {isAdmin && (
                <>
                  {!showCreateTeam ? (
                    <Button variant="primary" size="md" onClick={() => setShowCreateTeam(true)} style={{ marginBottom: '1rem' }}>
                      Create team
                    </Button>
                  ) : (
                    <form onSubmit={handleCreateTeam} className="dashboard-form" style={{ marginBottom: '1rem' }}>
                      <input
                        type="text"
                        placeholder="Team name"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        className="auth-input"
                        disabled={createLoading}
                      />
                      {error && <p className="auth-error">{error}</p>}
                      <div className="dashboard-form-actions">
                        <Button type="submit" variant="primary" size="md" disabled={createLoading}>
                          {createLoading ? 'Creating...' : 'Create'}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => { setShowCreateTeam(false); setError(''); setNewTeamName(''); }}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              )}
              <ul className="org-teams-list">
                {teams.map((team) => (
                  <li key={team.id} className="org-team-item">
                    <Link to={`/app/org/${activeOrgId}/teams/${team.id}`} className="org-team-link">
                      {team.name}
                    </Link>
                    {!teamMemberships[team.id]?.state && (
                      <Button variant="outline" size="md" onClick={() => handleRequestJoinTeam(team.id)} disabled={requesting[team.id]}>
                        {requesting[team.id] ? '...' : 'Request to join'}
                      </Button>
                    )}
                    {teamMemberships[team.id]?.state === 'pending' && (
                      <span className="org-team-pending">Pending</span>
                    )}
                  </li>
                ))}
                {teams.length === 0 && (
                  <li className="org-teams-empty">No teams yet. {isAdmin && 'Create one above.'}</li>
                )}
              </ul>
            </section>

            {/* Organization admin */}
            {isAdmin && (
              <section className="dashboard-section dashboard-section-admin">
                <h3 className="dashboard-section-title">Organization</h3>
                <p className="dashboard-section-desc">Invite members and manage requests.</p>

                <div className="org-admin-invite-block">
                  <h4 className="dashboard-subtitle">Invite by email</h4>
                  <form onSubmit={handleInvite} className="org-admin-invite-form">
                    <input
                      type="email"
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="org-admin-invite-input"
                      disabled={inviteLoading}
                    />
                    <button type="submit" className="org-admin-btn org-admin-btn-approve" disabled={inviteLoading}>
                      {inviteLoading ? 'Sending…' : 'Send invitation'}
                    </button>
                  </form>
                  {inviteError && <p className="org-admin-error">{inviteError}</p>}
                  {inviteSuccess && <p className="org-admin-success">{inviteSuccess}</p>}
                </div>

                <div className="org-admin-block">
                  <h4 className="dashboard-subtitle">Pending join requests</h4>
                  {pending.length === 0 ? (
                    <p className="app-muted">No pending requests.</p>
                  ) : (
                    <ul className="member-list">
                      {pending.map((req) => {
                        const profile = userProfiles[req.userId]
                        const authUserForDisplay = req.userId === user?.uid ? user : null
                        const first = (profile?.firstName || '').trim()
                        const last = (profile?.lastName || '').trim()
                        const fullName = `${first} ${last}`.trim() || authUserForDisplay?.displayName || getDisplayName(profile, req.userId) || `User ${req.userId.slice(0, 8)}…`
                        const email = (profile?.email || authUserForDisplay?.email || '').trim()
                        const showEmail = email && fullName !== email
                        const photoUrl = getProfilePictureUrl(profile, authUserForDisplay)
                        const initials = fullName ? fullName.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) : email?.[0]?.toUpperCase() || '?'
                        return (
                        <li key={req.userId} className="member-card member-card-pending">
                          <div className="member-card-avatar">
                            {photoUrl ? (
                              <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                            ) : null}
                            <span className="member-card-initials" style={{ display: photoUrl ? 'none' : 'flex' }}>{initials}</span>
                          </div>
                          <div className="member-card-info">
                            <span className="member-card-name">{fullName || email}</span>
                            {showEmail && <span className="member-card-email">{email}</span>}
                            <span className="member-card-role">pending</span>
                          </div>
                          <div className="org-admin-actions">
                            <button
                              className="org-admin-btn org-admin-btn-approve"
                              onClick={() => handleApprove(req.userId)}
                              disabled={adminLoading[req.userId]}
                            >
                              {adminLoading[req.userId] ? '…' : 'Approve'}
                            </button>
                            <button
                              className="org-admin-btn org-admin-btn-reject"
                              onClick={() => handleReject(req.userId)}
                              disabled={adminLoading[req.userId]}
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <div className="org-admin-block">
                  <h4 className="dashboard-subtitle">Members</h4>
                  <ul className="member-list">
                    {members.map((m) => {
                      const profile = userProfiles[m.userId]
                      const authUserForDisplay = m.userId === user?.uid ? user : null
                      const first = (profile?.firstName || '').trim()
                      const last = (profile?.lastName || '').trim()
                      const fullName = `${first} ${last}`.trim() || authUserForDisplay?.displayName || getDisplayName(profile, m.userId) || `User ${m.userId.slice(0, 8)}…`
                      const email = (profile?.email || authUserForDisplay?.email || '').trim()
                      const showEmail = email && fullName !== email
                      const photoUrl = getProfilePictureUrl(profile, authUserForDisplay)
                      const initials = fullName ? fullName.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) : email?.[0]?.toUpperCase() || '?'
                      return (
                        <li key={m.userId} className="member-card">
                          <div className="member-card-avatar">
                            {photoUrl ? (
                              <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                            ) : null}
                            <span className="member-card-initials" style={{ display: photoUrl ? 'none' : 'flex' }}>{initials}</span>
                          </div>
                          <div className="member-card-info">
                            <span className="member-card-name">{fullName || email}</span>
                            {showEmail && <span className="member-card-email">{email}</span>}
                            <span className="member-card-role">{m.role}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  )
}
