/**
 * Organization dashboard — org-scoped overview with stats, teams, shortcuts.
 * Distinct from OrgProfilePage (org profile/editing).
 */
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom'
import { getOrg, getMembership, getOrgMembers, getPendingRequests, canManageOrg, MEMBERSHIP_STATES } from '../lib/orgService'
import { getOrgTeams, getTeamMembership } from '../lib/teamService'
import { getMeetingsForUserInOrg } from '../lib/meetingService'
import { CalendarIcon, VideoIcon, MessageSquareIcon, SettingsIcon, BuildingIcon, UsersIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './Dashboard.css'
import './OrgPage.css'

export function OrgDashboardPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { user, setNavExtra } = useOutletContext() || {}
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [pendingCount, setPendingCount] = useState(0)

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
      if (!memData || memData.state !== MEMBERSHIP_STATES.active) {
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
    const load = async () => {
      const [membersData, teamsData] = await Promise.all([
        getOrgMembers(orgId),
        getOrgTeams(orgId),
      ])
      setMembers(membersData.filter((m) => m.state === MEMBERSHIP_STATES.active))
      setTeams(teamsData)
      if (user?.uid) {
        const mems = {}
        for (const team of teamsData) {
          const m = await getTeamMembership(orgId, team.id, user.uid)
          if (m) mems[team.id] = m
        }
        setTeamMemberships(mems)
      }
    }
    load()
  }, [orgId, user?.uid])

  useEffect(() => {
    if (!user?.uid || !orgId) return
    getMeetingsForUserInOrg(user.uid, orgId).then(setUpcomingMeetings)
  }, [user?.uid, orgId])

  useEffect(() => {
    if (!orgId || !membership || !canManageOrg(membership)) return
    getPendingRequests(orgId).then((p) => setPendingCount(p.length))
  }, [orgId, membership])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  if (!org || !membership) return null

  const isAdmin = canManageOrg(membership)

  return (
    <main className="app-main dashboard-main org-dashboard-main">
      <Link to="/app" className="page-back-btn">
        ← Back to main dashboard
      </Link>

      <div className="org-dashboard-header">
        <h2>{org.name}</h2>
        <p className="org-dashboard-subtitle">Organization dashboard</p>
      </div>

      <div className="dashboard-overview">
        <div className="dashboard-stats">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{members.length}</span>
            <span className="dashboard-stat-label">Members</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{teams.length}</span>
            <span className="dashboard-stat-label">Teams</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-value">{upcomingMeetings.length}</span>
            <span className="dashboard-stat-label">Upcoming</span>
          </div>
          {isAdmin && pendingCount > 0 && (
            <Link to={`/app/org/${orgId}/admin`} className="dashboard-stat-card dashboard-stat-card-action">
              <span className="dashboard-stat-value">{pendingCount}</span>
              <span className="dashboard-stat-label">Pending</span>
            </Link>
          )}
        </div>

        <div className="dashboard-shortcuts">
          <Link to={`/app/org/${orgId}/chats`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><MessageSquareIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Chats</span>
            <span className="dashboard-shortcut-hint">{org.name} conversations</span>
          </Link>
          <Link to={`/app/org/${orgId}/calendar`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><CalendarIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Calendar</span>
            <span className="dashboard-shortcut-hint">{org.name} meetings only</span>
          </Link>
          <Link to="/app/video" className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><VideoIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Video Call</span>
            <span className="dashboard-shortcut-hint">Join or start a call</span>
          </Link>
          <Link to={`/app/org/${orgId}/profile`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><BuildingIcon size={24} /></span>
            <span className="dashboard-shortcut-label">View organization profile</span>
            <span className="dashboard-shortcut-hint">About, photo & description</span>
          </Link>
          {isAdmin && (
            <Link to={`/app/org/${orgId}/admin`} className="dashboard-shortcut">
              <span className="dashboard-shortcut-icon"><SettingsIcon size={24} /></span>
              <span className="dashboard-shortcut-label">Admin</span>
              <span className="dashboard-shortcut-hint">Members, teams & invites</span>
            </Link>
          )}
        </div>

        <section className="dashboard-widget dashboard-widget-wide">
          <div className="dashboard-widget-header">
            <h3 className="dashboard-widget-title">
              <UsersIcon size={20} />
              Teams
            </h3>
            {isAdmin && (
              <Link to={`/app/org/${orgId}/admin`} className="dashboard-widget-link">Manage in Admin →</Link>
            )}
          </div>
          <ul className="org-teams-list">
            {teams.map((team) => (
              <li key={team.id} className="org-team-item">
                <Link to={`/app/org/${orgId}/teams/${team.id}`} className="org-team-link">
                  {team.name}
                </Link>
              </li>
            ))}
            {teams.length === 0 && (
              <li className="org-teams-empty">No teams yet{isAdmin && ' — create one in Admin'}</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  )
}
