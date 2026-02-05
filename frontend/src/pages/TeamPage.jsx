import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getOrg, getMembership } from '../lib/orgService'
import {
  getTeam,
  getTeamMembership,
  getTeamMembers,
  getPendingTeamRequests,
  updateTeamMembershipState,
  canManageTeam,
  canAccessTeam,
  TEAM_STATES,
} from '../lib/teamService'
import { getUserDoc, getDisplayName, getMemberDisplayLine } from '../lib/userService'
import { AppHeader, AppFooter } from '../components/app'
import { createMeeting, getTeamMeetings, MEETING_SCOPES } from '../lib/meetingService'
import '../styles/variables.css'
import './AppLayout.css'
import './AppDashboardPage.css'
import './OrgPage.css'
import './OrgAdminPage.css'

export function TeamPage() {
  const { orgId, teamId } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [org, setOrg] = useState(null)
  const [orgMembership, setOrgMembership] = useState(null)
  const [team, setTeam] = useState(null)
  const [teamMembership, setTeamMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [meetings, setMeetings] = useState([])
  const [userProfiles, setUserProfiles] = useState({})
  const [showCreateMeeting, setShowCreateMeeting] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [meetingError, setMeetingError] = useState('')
  const [loading, setLoading] = useState({})

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        navigate('/login')
        return
      }
      setUser(u)
    })
    return unsub
  }, [navigate])

  useEffect(() => {
    if (!user || !orgId || !teamId) return
    const load = async () => {
      const [orgData, orgMem, teamData, teamMem] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
        getTeam(orgId, teamId),
        getTeamMembership(orgId, teamId, user.uid),
      ])
      if (!orgData || !orgMem || orgMem.state !== 'active') {
        navigate(`/app/org/${orgId}`)
        return
      }
      if (!teamData) {
        navigate(`/app/org/${orgId}`)
        return
      }
      if (!canAccessTeam(teamMem, orgMem)) {
        navigate(`/app/org/${orgId}`)
        return
      }
      setOrg(orgData)
      setOrgMembership(orgMem)
      setTeam(teamData)
      setTeamMembership(teamMem)
    }
    load()
  }, [user, orgId, teamId, navigate])

  useEffect(() => {
    if (!orgId || !teamId) return
    const load = async () => {
      const [membersData, pendingData] = await Promise.all([
        getTeamMembers(orgId, teamId),
        getPendingTeamRequests(orgId, teamId),
      ])
      setMembers(membersData.filter((m) => m.state === TEAM_STATES.active))
      setPending(pendingData)
      const userIds = [...new Set([
        ...membersData.map((m) => m.userId),
        ...pendingData.map((p) => p.userId),
      ])]
      const profiles = {}
      await Promise.all(userIds.map(async (uid) => {
        profiles[uid] = await getUserDoc(uid)
      }))
      setUserProfiles(profiles)
    }
    load()
  }, [orgId, teamId])

  useEffect(() => {
    if (!orgId || !teamId) return
    const load = async () => {
      const list = await getTeamMeetings(orgId, teamId)
      setMeetings(list)
    }
    load()
  }, [orgId, teamId])

  const handleCreateMeeting = async (e) => {
    e.preventDefault()
    setMeetingError('')
    if (!newMeetingTitle.trim()) return
    setCreatingMeeting(true)
    try {
      await createMeeting(orgId, {
        title: newMeetingTitle.trim(),
        scope: MEETING_SCOPES.team,
        scopeTeamId: teamId,
      }, user.uid)
      setShowCreateMeeting(false)
      setNewMeetingTitle('')
      const list = await getTeamMeetings(orgId, teamId)
      setMeetings(list)
    } catch (err) {
      setMeetingError(err.message || 'Failed to create meeting.')
    } finally {
      setCreatingMeeting(false)
    }
  }

  const handleApprove = async (userId) => {
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateTeamMembershipState(orgId, teamId, userId, TEAM_STATES.active)
      setPending((p) => p.filter((m) => m.userId !== userId))
      setMembers((m) => [...m, { userId, role: 'member', state: TEAM_STATES.active }])
      const profile = await getUserDoc(userId)
      setUserProfiles((p) => ({ ...p, [userId]: profile }))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  const handleReject = async (userId) => {
    setLoading((l) => ({ ...l, [userId]: true }))
    try {
      await updateTeamMembershipState(orgId, teamId, userId, TEAM_STATES.rejected)
      setPending((p) => p.filter((m) => m.userId !== userId))
    } finally {
      setLoading((l) => ({ ...l, [userId]: false }))
    }
  }

  if (!org || !team) return null

  const isAdmin = canManageTeam(teamMembership, orgMembership)

  const navExtra = (
    <Link to="/app" className="app-nav-link">← Dashboard</Link>
  )

  return (
    <div className="app-layout">
      <AppHeader user={user} navExtra={navExtra} />
      <main className="app-main org-admin-main">
        <h2>{team.name}</h2>
        <p className="app-muted">Team-scoped meetings (visible to team members).</p>
        {teamMembership?.state === TEAM_STATES.active && (
          <div style={{ marginBottom: '1rem' }}>
            {!showCreateMeeting ? (
              <button
                type="button"
                className="org-admin-btn"
                onClick={() => setShowCreateMeeting(true)}
              >
                Create meeting
              </button>
            ) : (
              <form onSubmit={handleCreateMeeting} className="org-create-team-form">
                <input
                  type="text"
                  placeholder="Meeting title"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  className="auth-input"
                  disabled={creatingMeeting}
                />
                {meetingError && <p className="auth-error">{meetingError}</p>}
                <div className="org-create-team-btns">
                  <button
                    type="submit"
                    className="org-admin-btn org-admin-btn-approve"
                    disabled={creatingMeeting}
                  >
                    {creatingMeeting ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    className="org-admin-btn"
                    onClick={() => { setShowCreateMeeting(false); setMeetingError(''); setNewMeetingTitle(''); }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {meetings.length === 0 ? (
          <p className="app-muted">No team meetings yet.</p>
        ) : (
          <ul className="meeting-list">
            {meetings.map((m) => (
              <li key={m.id} className="meeting-item">
                <span className="meeting-title">{m.title}</span>
                <span className="meeting-meta">{m.scope}</span>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && pending.length > 0 && (
          <section className="org-admin-section">
            <h3>Pending join requests</h3>
            <ul className="org-admin-list">
              {pending.map((req) => (
                <li key={req.userId} className="org-admin-list-item">
                  <span>{getMemberDisplayLine(userProfiles[req.userId], req.userId, req.userId === user?.uid ? user : null, 'pending')}</span>
                  <div className="org-admin-actions">
                    <button
                      className="org-admin-btn org-admin-btn-approve"
                      onClick={() => handleApprove(req.userId)}
                      disabled={loading[req.userId]}
                    >
                      {loading[req.userId] ? '…' : 'Approve'}
                    </button>
                    <button
                      className="org-admin-btn org-admin-btn-reject"
                      onClick={() => handleReject(req.userId)}
                      disabled={loading[req.userId]}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="org-admin-section">
          <h3>Members</h3>
          <ul className="org-admin-list">
            {members.map((m) => (
              <li key={m.userId} className="org-admin-list-item">
                <span>{getMemberDisplayLine(userProfiles[m.userId], m.userId, m.userId === user?.uid ? user : null, m.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <AppFooter />
    </div>
  )
}
