import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getOrg, getMembership, canManageOrg } from '../lib/orgService'
import {
  getOrgTeams,
  createTeam,
  getTeamMembership,
  requestToJoinTeam,
} from '../lib/teamService'
import { createMeeting, getOrgMeetings, MEETING_SCOPES } from '../lib/meetingService'
import { AppHeader, AppFooter } from '../components/app'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './AppDashboardPage.css'
import './OrgPage.css'

export function OrgPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [meetings, setMeetings] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [showCreateMeeting, setShowCreateMeeting] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState({})

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
    if (!user || !orgId) return
    const load = async () => {
      const [orgData, memData] = await Promise.all([
        getOrg(orgId),
        getMembership(orgId, user.uid),
      ])
      if (!orgData) {
        navigate('/app')
        return
      }
      if (!memData || memData.state !== 'active') {
        navigate('/app')
        return
      }
      setOrg(orgData)
      setMembership(memData)
    }
    load()
  }, [user, orgId, navigate])

  useEffect(() => {
    if (!orgId || !user) return
    const load = async () => {
      const teamsData = await getOrgTeams(orgId)
      setTeams(teamsData)
      const mems = {}
      for (const team of teamsData) {
        const m = await getTeamMembership(orgId, team.id, user.uid)
        if (m) mems[team.id] = m
      }
      setTeamMemberships(mems)
    }
    load()
  }, [orgId, user, showCreate])

  useEffect(() => {
    if (!orgId) return
    const load = async () => {
      const list = await getOrgMeetings(orgId)
      setMeetings(list)
    }
    load()
  }, [orgId])

  const handleCreateMeeting = async (e) => {
    e.preventDefault()
    setError('')
    if (!newMeetingTitle.trim()) return
    setCreatingMeeting(true)
    try {
      await createMeeting(orgId, {
        title: newMeetingTitle.trim(),
        scope: MEETING_SCOPES.org,
      }, user.uid)
      setShowCreateMeeting(false)
      setNewMeetingTitle('')
      const list = await getOrgMeetings(orgId)
      setMeetings(list)
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
    setLoading(true)
    try {
      const team = await createTeam(orgId, newTeamName, user.uid)
      setShowCreate(false)
      setNewTeamName('')
      setTeams((t) => [...t, team])
    } catch (err) {
      setError(err.message || 'Failed to create team.')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestJoin = async (teamId) => {
    setError('')
    setRequesting((r) => ({ ...r, [teamId]: true }))
    try {
      await requestToJoinTeam(orgId, teamId, user.uid)
      const mem = await getTeamMembership(orgId, teamId, user.uid)
      setTeamMemberships((m) => ({ ...m, [teamId]: mem }))
    } catch (err) {
      setError(err.message || 'Failed to send request.')
    } finally {
      setRequesting((r) => ({ ...r, [teamId]: false }))
    }
  }

  if (!org || !membership) return null

  const isAdmin = canManageOrg(membership)

  const navExtra = (
    <>
      <Link to="/app" className="app-nav-link">Dashboard</Link>
      {isAdmin && (
        <Link to={`/app/org/${orgId}/admin`} className="app-nav-link">Admin</Link>
      )}
    </>
  )

  return (
    <div className="app-layout">
      <AppHeader user={user} navExtra={navExtra} />
      <main className="app-main org-page-main">
        <h2>Org meetings</h2>
        <p className="app-muted">Org-scoped meetings (visible to all org members).</p>
        <div className="org-meetings-actions" style={{ marginBottom: '1rem' }}>
          {!showCreateMeeting ? (
            <Button variant="outline" size="md" onClick={() => setShowCreateMeeting(true)}>
              Create meeting
            </Button>
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
              {error && <p className="auth-error">{error}</p>}
              <div className="org-create-team-btns">
                <Button type="submit" variant="primary" size="md" disabled={creatingMeeting}>
                  {creatingMeeting ? 'Creating...' : 'Create'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setShowCreateMeeting(false); setError(''); setNewMeetingTitle(''); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
        {meetings.length === 0 ? (
          <p className="app-muted">No org meetings yet.</p>
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

        <h2 style={{ marginTop: '2rem' }}>Teams</h2>
        {error && <p className="auth-error">{error}</p>}
        {isAdmin && (
          <div className="org-teams-actions">
            {!showCreate ? (
              <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
                Create team
              </Button>
            ) : (
              <form onSubmit={handleCreateTeam} className="org-create-team-form">
                <input
                  type="text"
                  placeholder="Team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="auth-input"
                  disabled={loading}
                />
                {error && <p className="auth-error">{error}</p>}
                <div className="org-create-team-btns">
                  <Button type="submit" variant="primary" size="md" disabled={loading}>
                    {loading ? 'Creating...' : 'Create'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => { setShowCreate(false); setError(''); setNewTeamName(''); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        <ul className="org-teams-list">
          {teams.map((team) => (
            <TeamListItem
              key={team.id}
              team={team}
              orgId={orgId}
              membership={teamMemberships[team.id]}
              onRequestJoin={handleRequestJoin}
              requesting={requesting[team.id]}
            />
          ))}
          {teams.length === 0 && (
            <li className="org-teams-empty">No teams yet. {isAdmin && 'Create one above.'}</li>
          )}
        </ul>
      </main>
      <AppFooter />
    </div>
  )
}

function TeamListItem({ team, orgId, membership, onRequestJoin, requesting }) {
  const isMember = membership?.state === 'active'
  const isPending = membership?.state === 'pending'
  const canJoin = team.allowOpenJoin

  return (
    <li className="org-team-item">
      <Link to={`/app/org/${orgId}/teams/${team.id}`} className="org-team-link">
        {team.name}
      </Link>
      {canJoin && !isMember && !isPending && (
        <Button variant="outline" size="md" onClick={() => onRequestJoin(team.id)} disabled={requesting}>
          {requesting ? '...' : 'Join'}
        </Button>
      )}
      {isPending && <span className="org-team-pending">Pending</span>}
    </li>
  )
}
