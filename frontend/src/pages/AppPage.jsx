import { useState, useEffect } from 'react'
import { useNavigate, Link, useOutletContext } from 'react-router-dom'
import {
  getActiveMembership,
  getPendingMembership,
  getPendingRequests,
  createOrg,
  searchOrgsByName,
  requestToJoinOrg,
  getOrg,
  getMembership,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import {
  getOrgTeams,
  getTeamMembership,
  requestToJoinTeam,
} from '../lib/teamService'
import { getMeetingsForUser } from '../lib/meetingService'
import { getTodos, addTodo, toggleTodo, deleteTodo } from '../lib/todoService'
import { Button } from '../components/ui/Button'
import { MiniCalendarWidget } from '../components/dashboard/MiniCalendarWidget'
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
  const { user, setNavExtra } = useOutletContext() || {}
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

  // Teams
  const [teams, setTeams] = useState([])
  const [teamMemberships, setTeamMemberships] = useState({})
  const [requesting, setRequesting] = useState({})
  const [pendingCount, setPendingCount] = useState(0)

  // To-dos
  const [todos, setTodos] = useState([])
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoDueDate, setNewTodoDueDate] = useState('')
  const [todoLoading, setTodoLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [active, pendingMem] = await Promise.all([
        getActiveMembership(user.uid),
        getPendingMembership(user.uid),
      ])
      if (active) setActiveOrgId(active.orgId)
      if (pendingMem) {
        const orgData = await getOrg(pendingMem.orgId)
        setPendingOrg(orgData || { id: pendingMem.orgId, name: 'Organization' })
        setView('pending')
      }
      setLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

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
    getMeetingsForUser(user.uid).then(setUpcomingMeetings)
  }, [user, activeOrgId])

  useEffect(() => {
    if (!activeOrgId || !membership || !canManageOrg(membership)) return
    getPendingRequests(activeOrgId).then((p) => setPendingCount(p.length))
  }, [activeOrgId, membership])

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
  }, [activeOrgId, user])

  useEffect(() => {
    if (!user?.uid) return
    getTodos(user.uid).then(setTodos)
  }, [user?.uid])

  const handleAddTodo = async (e) => {
    e.preventDefault()
    if (!newTodoText.trim() || !user?.uid) return
    setTodoLoading(true)
    try {
      const dueDate = newTodoDueDate ? new Date(newTodoDueDate + 'T00:00:00') : null
      const t = await addTodo(user.uid, newTodoText.trim(), dueDate)
      setTodos((prev) => [...prev, t])
      setNewTodoText('')
      setNewTodoDueDate('')
    } catch {
      // ignore
    } finally {
      setTodoLoading(false)
    }
  }

  const handleToggleTodo = async (todoId, done) => {
    if (!user?.uid) return
    try {
      await toggleTodo(user.uid, todoId, done)
      setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, done } : t)))
    } catch {
      // ignore
    }
  }

  const handleDeleteTodo = async (todoId) => {
    if (!user?.uid) return
    try {
      await deleteTodo(user.uid, todoId)
      setTodos((prev) => prev.filter((t) => t.id !== todoId))
    } catch {
      // ignore
    }
  }

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

  if (!user) return null

  const needsOrg = !activeOrgId && !pendingOrg
  const isAdmin = membership && canManageOrg(membership)

  return (
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
          <div className="dashboard-overview">
            {/* Stats row */}
            <div className="dashboard-stats">
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-value">{todos.filter((t) => !t.done).length}</span>
                <span className="dashboard-stat-label">Tasks</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-value">{upcomingMeetings.length}</span>
                <span className="dashboard-stat-label">Upcoming</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-value">{teams.length}</span>
                <span className="dashboard-stat-label">Teams</span>
              </div>
              {isAdmin && pendingCount > 0 && (
                <Link to={`/app/org/${activeOrgId}/admin`} className="dashboard-stat-card dashboard-stat-card-action">
                  <span className="dashboard-stat-value">{pendingCount}</span>
                  <span className="dashboard-stat-label">Pending</span>
                </Link>
              )}
            </div>

            {/* Shortcuts */}
            <div className="dashboard-shortcuts">
              <Link to="/app/calendar" className="dashboard-shortcut">
                <span className="dashboard-shortcut-icon">📅</span>
                <span className="dashboard-shortcut-label">Calendar</span>
                <span className="dashboard-shortcut-hint">Schedule & view meetings</span>
              </Link>
              <Link to={activeOrgId ? `/app/org/${activeOrgId}/chats` : '/app/chats'} className="dashboard-shortcut">
                <span className="dashboard-shortcut-icon">💬</span>
                <span className="dashboard-shortcut-label">Chats</span>
                <span className="dashboard-shortcut-hint">Messages & conversations</span>
              </Link>
              {isAdmin && activeOrgId && (
                <Link to={`/app/org/${activeOrgId}/admin`} className="dashboard-shortcut">
                  <span className="dashboard-shortcut-icon">⚙</span>
                  <span className="dashboard-shortcut-label">Admin</span>
                  <span className="dashboard-shortcut-hint">Members, teams & invites</span>
                </Link>
              )}
            </div>

            {/* Compact widgets */}
            <div className="dashboard-widgets">
              <section className="dashboard-widget dashboard-widget-tasks">
                <div className="dashboard-widget-header">
                  <h3 className="dashboard-widget-title">Tasks</h3>
                  <Link to="/app/calendar" className="dashboard-widget-link">View in calendar →</Link>
                </div>
                <form onSubmit={handleAddTodo} className="dashboard-todo-add-form">
                  <input
                    type="text"
                    placeholder="Add task…"
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    className="auth-input dashboard-todo-input"
                    disabled={todoLoading}
                  />
                  <input
                    type="date"
                    value={newTodoDueDate}
                    onChange={(e) => setNewTodoDueDate(e.target.value)}
                    className="auth-input dashboard-todo-due"
                    disabled={todoLoading}
                    title="Due date (optional)"
                  />
                  <Button type="submit" variant="outline" size="sm" disabled={todoLoading || !newTodoText.trim()}>
                    Add
                  </Button>
                </form>
                <ul className="dashboard-todo-list dashboard-todo-list-compact">
                  {todos.slice(0, 5).map((t) => (
                    <li key={t.id} className={`dashboard-todo-item ${t.done ? 'dashboard-todo-done' : ''}`}>
                      <input
                        type="checkbox"
                        checked={!!t.done}
                        onChange={(e) => handleToggleTodo(t.id, e.target.checked)}
                        className="dashboard-todo-check"
                      />
                      <span className="dashboard-todo-text">{t.text}</span>
                      <button type="button" className="dashboard-todo-delete" onClick={() => handleDeleteTodo(t.id)} aria-label="Delete">×</button>
                    </li>
                  ))}
                  {todos.length === 0 && <li className="dashboard-todo-empty">No tasks yet</li>}
                  {todos.length > 5 && <li className="dashboard-todo-more">+{todos.length - 5} more</li>}
                </ul>
              </section>

              <section className="dashboard-widget dashboard-widget-calendar">
                <MiniCalendarWidget userId={user?.uid} />
              </section>

              <section className="dashboard-widget dashboard-widget-wide">
                <div className="dashboard-widget-header">
                  <h3 className="dashboard-widget-title">Teams</h3>
                  {isAdmin && activeOrgId && (
                    <Link to={`/app/org/${activeOrgId}/admin`} className="dashboard-widget-link">Manage in Admin →</Link>
                  )}
                </div>
                <ul className="org-teams-list">
                  {teams.map((team) => (
                    <li key={team.id} className="org-team-item">
                      <Link to={`/app/org/${activeOrgId}/teams/${team.id}`} className="org-team-link">
                        {team.name}
                      </Link>
                      {!teamMemberships[team.id]?.state && (
                        <Button variant="outline" size="sm" onClick={() => handleRequestJoinTeam(team.id)} disabled={requesting[team.id]}>
                          {requesting[team.id] ? '...' : 'Join'}
                        </Button>
                      )}
                      {teamMemberships[team.id]?.state === 'pending' && (
                        <span className="org-team-pending">Pending</span>
                      )}
                    </li>
                  ))}
                  {teams.length === 0 && (
                    <li className="org-teams-empty">No teams yet{isAdmin && ' — create one in Admin'}</li>
                  )}
                </ul>
              </section>
            </div>
          </div>
        )}
    </main>
  )
}
