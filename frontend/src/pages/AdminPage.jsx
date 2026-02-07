import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  getOrg,
  getMembership,
  getOrgMembers,
  getPendingRequests,
  getRejectedRequests,
  updateMembershipState,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import { createOrgInvitation, getRejectedInvitationsForOrg } from '../lib/invitationService'
import { getOrgTeams, createTeam, getTeamMembership, TEAM_STATES } from '../lib/teamService'
import { getUserDoc, getDisplayName, getMemberDisplayLine, getProfilePictureUrl } from '../lib/userService'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './OrgAdminPage.css'
import './Dashboard.css'

export function AdminPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { user } = useOutletContext() || {}
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [rejected, setRejected] = useState([])
  const [rejectedInvitations, setRejectedInvitations] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [adminLoading, setAdminLoading] = useState({})
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [createTeamLoading, setCreateTeamLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !orgId) return
    const load = async () => {
      const [orgData, memData] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
      ])
      if (!orgData || !memData || memData.state !== MEMBERSHIP_STATES.active) {
        navigate('/app')
        return
      }
      if (!canManageOrg(memData)) {
        navigate('/app')
        return
      }
      setOrg(orgData)
      setMembership(memData)
    }
    load()
  }, [user, orgId, navigate])

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    const load = async () => {
      const [membersData, pendingData, rejectedData, rejectedInvs, teamsList] = await Promise.all([
        getOrgMembers(orgId),
        getPendingRequests(orgId),
        getRejectedRequests(orgId),
        getRejectedInvitationsForOrg(orgId).catch(() => []),
        getOrgTeams(orgId),
      ])
      setMembers(membersData.filter((m) => m.state === MEMBERSHIP_STATES.active))
      setPending(pendingData)
      setRejected(rejectedData)
      setRejectedInvitations(rejectedInvs)
      setTeams(teamsList)
      const userIds = [...new Set([
        ...membersData.map((m) => m.userId),
        ...pendingData.map((p) => p.userId),
        ...rejectedData.map((r) => r.userId),
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
      if (user?.uid) {
        const mems = {}
        for (const t of teamsList) {
          const m = await getTeamMembership(orgId, t.id, user.uid)
          if (m && m.state === TEAM_STATES.active) mems[t.id] = m
        }
        setTeamMemberships(mems)
      }
      setLoading(false)
    }
    load()
  }, [orgId, user?.uid])

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
      const inviterProfile = userProfiles[user?.uid] || null
      const inviterLabel = getMemberDisplayLine(inviterProfile, user?.uid, user, null)
      await createOrgInvitation(
        orgId,
        email,
        user.uid,
        inviterLabel || getDisplayName(inviterProfile, user?.uid),
        inviterProfile?.email || user?.email || '',
        org?.name || 'Organization'
      )
      setInviteSuccess(`Invitation sent to ${email}.`)
      setInviteEmail('')
    } catch (err) {
      setInviteError(err.message || 'Failed to send invitation.')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleApprove = async (userId) => {
    setAdminLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateMembershipState(orgId, userId, MEMBERSHIP_STATES.active)
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
      await updateMembershipState(orgId, userId, MEMBERSHIP_STATES.rejected)
      setPending((p) => p.filter((m) => m.userId !== userId))
      setRejected((r) => [...r, { userId }])
    } finally {
      setAdminLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleCreateTeam = async (e) => {
    e.preventDefault()
    if (!newTeamName.trim()) return
    setCreateTeamLoading(true)
    try {
      const team = await createTeam(orgId, newTeamName.trim(), user.uid)
      setTeams((t) => [...t, team])
      setShowCreateTeam(false)
      setNewTeamName('')
      const m = await getTeamMembership(orgId, team.id, user.uid)
      if (m) setTeamMemberships((prev) => ({ ...prev, [team.id]: m }))
    } catch (err) {
      setInviteError(err.message || 'Failed to create team.')
    } finally {
      setCreateTeamLoading(false)
    }
  }

  if (!org || !membership) return null

  if (loading) {
    return (
      <main className="app-main org-admin-main">
        <p className="app-muted">Loading…</p>
      </main>
    )
  }

  const rejectedTotal = rejected.length + rejectedInvitations.length

  return (
    <main className="app-main org-admin-main">
      <div className="org-admin-header">
        <div>
          <h2>Admin</h2>
          <p className="org-admin-subtitle">{org.name}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="org-admin-stats">
        <div className="org-admin-stat">
          <span className="org-admin-stat-value">{members.length}</span>
          <span className="org-admin-stat-label">Members</span>
        </div>
        <div className="org-admin-stat org-admin-stat-highlight">
          <span className="org-admin-stat-value">{pending.length}</span>
          <span className="org-admin-stat-label">Pending</span>
        </div>
        <div className="org-admin-stat">
          <span className="org-admin-stat-value">{teams.length}</span>
          <span className="org-admin-stat-label">Teams</span>
        </div>
        <div className="org-admin-stat">
          <span className="org-admin-stat-value">{rejectedTotal}</span>
          <span className="org-admin-stat-label">Declined</span>
        </div>
      </div>

      <div className="org-admin-grid">
        <section className="org-admin-section org-admin-section-invite">
          <h3>Invite by email</h3>
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
        </section>

        <section className="org-admin-section">
          <h3>Pending join requests</h3>
        {pending.length === 0 ? (
          <p className="app-muted">No pending requests.</p>
        ) : (
          <ul className="member-list">
            {pending.map((req) => {
              const profile = userProfiles[req.userId]
              const authUserForDisplay = req.userId === user?.uid ? user : null
              const fullName = getDisplayName(profile, req.userId, authUserForDisplay)
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
        </section>

        <section className="org-admin-section">
          <h3>Rejected join requests</h3>
        {rejected.length === 0 ? (
          <p className="app-muted">No rejected requests.</p>
        ) : (
          <ul className="member-list">
            {rejected.map((req) => {
              const profile = userProfiles[req.userId]
              const fullName = getDisplayName(profile, req.userId)
              const email = (profile?.email || '').trim()
              return (
                <li key={req.userId} className="member-card member-card-rejected">
                  <div className="member-card-avatar">
                    <span className="member-card-initials">{(fullName || email || '?')[0]?.toUpperCase()}</span>
                  </div>
                  <div className="member-card-info">
                    <span className="member-card-name">{fullName || email || `User ${req.userId.slice(0, 8)}…`}</span>
                    {email && fullName !== email && <span className="member-card-email">{email}</span>}
                    <span className="member-card-role member-card-role-rejected">rejected</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        </section>

        <section className="org-admin-section">
          <h3>Rejected invitations</h3>
        {rejectedInvitations.length === 0 ? (
          <p className="app-muted">No rejected invitations.</p>
        ) : (
          <ul className="member-list">
            {rejectedInvitations.map((inv) => (
              <li key={inv.id} className="member-card member-card-rejected">
                <div className="member-card-avatar">
                  <span className="member-card-initials">{(inv.inviteeEmail || '?')[0].toUpperCase()}</span>
                </div>
                <div className="member-card-info">
                  <span className="member-card-name">{inv.inviteeEmail || 'Unknown email'}</span>
                  <span className="member-card-role member-card-role-rejected">declined invite</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        </section>

        <section className="org-admin-section org-admin-section-wide">
          <h3>Members</h3>
        <ul className="member-list">
          {members.map((m) => {
            const profile = userProfiles[m.userId]
            const authUserForDisplay = m.userId === user?.uid ? user : null
            const fullName = getDisplayName(profile, m.userId, authUserForDisplay)
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
        </section>

        <section className="org-admin-section org-admin-section-wide">
          <h3>Teams</h3>
        <p className="app-muted" style={{ marginBottom: '0.75rem' }}>
          Create and manage teams. Team leaders can approve join requests from the team page.
        </p>
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
              disabled={createTeamLoading}
            />
            {inviteError && <p className="org-admin-error">{inviteError}</p>}
            <div className="dashboard-form-actions" style={{ marginTop: '0.5rem' }}>
              <Button type="submit" variant="primary" size="md" disabled={createTeamLoading || !newTeamName.trim()}>
                {createTeamLoading ? 'Creating…' : 'Create'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowCreateTeam(false); setNewTeamName(''); setInviteError(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        <ul className="org-teams-list">
          {teams.map((t) => (
            <li key={t.id} className="org-team-item">
              <Link to={`/app/org/${orgId}/teams/${t.id}`} className="org-team-link">
                {t.name}
              </Link>
              {teamMemberships[t.id] && (
                <span className="org-team-badge">Your team</span>
              )}
            </li>
          ))}
          {teams.length === 0 && (
            <li className="org-teams-empty">No teams yet. Create one above.</li>
          )}
        </ul>
        </section>
      </div>
    </main>
  )
}
