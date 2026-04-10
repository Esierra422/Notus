/**
 * Organization dashboard: org-scoped overview with stats, teams, shortcuts.
 * Distinct from OrgProfilePage (org profile/editing).
 */
import { useState, useEffect, Suspense } from 'react'
import { lazyRoute } from '../lib/lazyRoute.js'
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom'
import { getOrg, getMembership, getOrgMembers, getPendingRequests, canManageOrg, MEMBERSHIP_STATES } from '../lib/orgService'
import { getOrgTeams, getTeamMembership } from '../lib/teamService'
import { getUpcomingMeetingsInHorizonForUserInOrg } from '../lib/meetingService'
import { formatMeetingRowWhen } from '../lib/dateUtils'
import { CalendarIcon, VideoIcon, MessageSquareIcon, SettingsIcon, BuildingIcon, UsersIcon, PencilIcon } from '../components/ui/Icons'
import { Skeleton } from '../components/ui/Skeleton'
import '../styles/variables.css'
import './AppLayout.css'
import './Dashboard.css'
import './OrgPage.css'
import './OrgProfilePage.css'

const EventDetailModal = lazyRoute(() =>
  import('../components/calendar/EventDetailModal').then((m) => ({ default: m.EventDetailModal }))
)

export function OrgDashboardPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
  const [org, setOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [members, setMembers] = useState([])
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [upcomingMeetingsLoading, setUpcomingMeetingsLoading] = useState(true)
  const [eventDetailItem, setEventDetailItem] = useState(null)
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
    if (!orgId || !membership || membership.orgId !== orgId || membership.state !== MEMBERSHIP_STATES.active) {
      setMembers([])
      setTeams([])
      setTeamMemberships({})
      return
    }
    const load = async () => {
      const admin = canManageOrg(membership)
      const teamsData = await getOrgTeams(orgId)
      if (admin) {
        const membersData = await getOrgMembers(orgId)
        setMembers(membersData.filter((m) => m.state === MEMBERSHIP_STATES.active))
      } else {
        setMembers([])
      }
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
  }, [orgId, user?.uid, membership])

  useEffect(() => {
    if (!user?.uid || !orgId || !membership || membership.orgId !== orgId || membership.state !== MEMBERSHIP_STATES.active) {
      setUpcomingMeetings([])
      setUpcomingMeetingsLoading(false)
      return
    }
    let cancelled = false
    setUpcomingMeetingsLoading(true)
    getUpcomingMeetingsInHorizonForUserInOrg(user.uid, orgId, 90, 12, { includeNonVideo: true })
      .then((list) => {
        if (!cancelled) setUpcomingMeetings(list)
      })
      .finally(() => {
        if (!cancelled) setUpcomingMeetingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, orgId, membership])

  useEffect(() => {
    if (!orgId || !membership || !canManageOrg(membership)) return
    getPendingRequests(orgId).then((p) => setPendingCount(p.length))
  }, [orgId, membership])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  if (!org || org.id !== orgId || !membership || membership.orgId !== orgId || membership.state !== MEMBERSHIP_STATES.active) {
    return null
  }

  const isAdmin = canManageOrg(membership)

  const reloadUpcoming = () => {
    if (!user?.uid || !orgId) return
    setUpcomingMeetingsLoading(true)
    getUpcomingMeetingsInHorizonForUserInOrg(user.uid, orgId, 90, 12, { includeNonVideo: true })
      .then(setUpcomingMeetings)
      .finally(() => setUpcomingMeetingsLoading(false))
  }

  return (
    <main className="app-main dashboard-main org-dashboard-main">
      <Link to="/app" className="page-back-btn">
        ← Back to main dashboard
      </Link>

      <div className="dashboard-overview">
        <section className="dashboard-enterprise-hero org-dashboard-enterprise-hero">
          <div
            className={`dashboard-enterprise-banner${org.bannerUrl ? ' dashboard-enterprise-banner--image' : ''}`}
            style={org.bannerUrl ? { backgroundImage: `url(${org.bannerUrl})` } : undefined}
            role="img"
            aria-label=""
          />
          <div className="dashboard-enterprise-hero-body">
            <div className="dashboard-enterprise-hero-main">
              <div className="dashboard-enterprise-avatar-col">
                <div className="org-profile-avatar-wrap team-dashboard-enterprise-avatar-wrap">
                  {org.imageUrl ? (
                    <img src={org.imageUrl} alt="" className="dashboard-enterprise-avatar" />
                  ) : (
                    <div className="profile-avatar-placeholder org-profile-avatar-placeholder dashboard-enterprise-avatar-placeholder">
                      <BuildingIcon size={36} />
                    </div>
                  )}
                </div>
              </div>
              <div className="dashboard-enterprise-hero-copy">
                <div className="dashboard-enterprise-title-row">
                  <h2 className="dashboard-enterprise-name">{org.name}</h2>
                  <div className="org-dashboard-hero-actions">
                    {isAdmin ? (
                      <div className="org-dashboard-hero-metrics" aria-label="Organization metrics">
                        <span className="org-dashboard-metric">
                          <span className="org-dashboard-metric__value">{members.length}</span>
                          <span className="org-dashboard-metric__label">Members</span>
                        </span>
                        <span className="org-dashboard-metric">
                          <span className="org-dashboard-metric__value">{teams.length}</span>
                          <span className="org-dashboard-metric__label">Teams</span>
                        </span>
                        {pendingCount > 0 ? (
                          <span className="org-dashboard-metric org-dashboard-metric--accent">
                            <span className="org-dashboard-metric__value">{pendingCount}</span>
                            <span className="org-dashboard-metric__label">Pending</span>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {isAdmin ? (
                      <Link to={`/app/org/${orgId}/profile`} className="org-dashboard-edit-btn">
                        <PencilIcon size={16} />
                        Edit profile
                      </Link>
                    ) : null}
                    {isAdmin ? (
                      <Link to={`/app/org/${orgId}/admin`} className="org-dashboard-edit-btn org-dashboard-edit-btn--ghost">
                        <SettingsIcon size={16} />
                        Admin
                      </Link>
                    ) : null}
                  </div>
                </div>
                <p className="dashboard-enterprise-subtitle">Organization dashboard</p>
                <div className="dashboard-enterprise-badges">
                  <span className="profile-badge profile-badge-org">{teams.length} teams</span>
                  <span className="profile-badge profile-badge-org">{isAdmin ? members.length : '—'} members</span>
                  {isAdmin && pendingCount > 0 ? <span className="profile-badge">Pending: {pendingCount}</span> : null}
                </div>
                <p className="dashboard-enterprise-about">
                  {org.description ? (
                    org.description
                  ) : isAdmin ? (
                    <>
                      Add a short description to help members understand what this organization is for.{' '}
                      <Link to={`/app/org/${orgId}/profile`} className="org-dashboard-inline-link">
                        Add description
                      </Link>
                      .
                    </>
                  ) : (
                    'No description provided.'
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="dashboard-shortcuts">
          <Link to={`/app/chats?org=${encodeURIComponent(orgId)}`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><MessageSquareIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Chats</span>
            <span className="dashboard-shortcut-hint">Main chats filtered to this org</span>
          </Link>
          <Link to={`/app/org/${orgId}/calendar`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><CalendarIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Calendar</span>
            <span className="dashboard-shortcut-hint">{org.name} meetings only</span>
          </Link>
          <Link to={`/app/org/${orgId}/video`} className="dashboard-shortcut">
            <span className="dashboard-shortcut-icon"><VideoIcon size={24} /></span>
            <span className="dashboard-shortcut-label">Video Call</span>
            <span className="dashboard-shortcut-hint">{org.name} only</span>
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

        <section className="dashboard-widget dashboard-widget-wide dashboard-upcoming-meetings-widget">
          <div className="dashboard-widget-header">
            <h3 className="dashboard-widget-title">
              <CalendarIcon size={20} />
              Upcoming meetings
            </h3>
            <Link to={`/app/org/${orgId}/calendar`} className="dashboard-widget-link">Calendar →</Link>
          </div>
          <p className="dashboard-section-desc team-dashboard-meetings-desc">
            Events and meetings you can access in this organization. Calendar-only items open details; video meetings open the lobby ready to join.
          </p>
          {upcomingMeetingsLoading ? (
            <div className="dashboard-widget-empty" aria-label="Loading upcoming meetings">
              <Skeleton lines={3} />
            </div>
          ) : upcomingMeetings.length === 0 ? (
            <p className="dashboard-widget-empty">
              No upcoming meetings are scheduled.{' '}
              <Link to={`/app/org/${orgId}/calendar`} className="dashboard-widget-link">
                Create a meeting in Calendar.
              </Link>
            </p>
          ) : (
            <ul className="dashboard-upcoming-list">
              {upcomingMeetings.map((m) => {
                const isCalOnly = m.isVideoMeeting === false
                const joinId = m._seriesId || m.id
                return (
                  <li key={m.id} className="dashboard-upcoming-row">
                    <div className="dashboard-upcoming-row-main">
                      <span className="dashboard-upcoming-title">{m.title || 'Untitled'}</span>
                      <span className="dashboard-upcoming-when">{formatMeetingRowWhen(m.startAt, userDoc)}</span>
                    </div>
                    <div className="dashboard-upcoming-row-actions">
                      {isCalOnly ? (
                        <button
                          type="button"
                          className="org-admin-btn org-admin-btn-approve dashboard-upcoming-action-btn"
                          onClick={() => setEventDetailItem(m)}
                        >
                          Details
                        </button>
                      ) : (
                        <Link
                          className="org-admin-btn org-admin-btn-approve dashboard-upcoming-action-link"
                          to={`/app/org/${encodeURIComponent(orgId)}/video?meetingId=${encodeURIComponent(joinId)}`}
                        >
                          Join
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

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
              <li className="org-teams-empty">
                No teams are available{isAdmin ? '. Create a team in Admin to get started.' : '.'}
              </li>
            )}
          </ul>
        </section>
      </div>

      <Suspense fallback={null}>
        <EventDetailModal
          item={eventDetailItem}
          isOpen={Boolean(eventDetailItem)}
          onClose={() => setEventDetailItem(null)}
          user={user}
          userDoc={userDoc}
          canManageOrg={isAdmin}
          onUpdated={() => reloadUpcoming()}
          onDeleted={() => {
            reloadUpcoming()
            setEventDetailItem(null)
          }}
        />
      </Suspense>
    </main>
  )
}
